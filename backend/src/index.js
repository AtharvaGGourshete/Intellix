console.log("🚀 Starting server...");

process.on("uncaughtException", (err) => {
  console.error("❌ UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ UNHANDLED REJECTION:", err);
});

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Mistral } from "@mistralai/mistralai";
import multer from "multer";
import { supabase } from "./config/supabase.js";
import fs from "fs";
import path from "path";
// import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";

dotenv.config();

console.log("ENV CHECK:");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY:", process.env.SUPABASE_PUBLISHABLE_DEFAULT_KEY);
console.log("MISTRAL KEY:", process.env.MISTRALAI_API_KEY);

// Ensure uploads folder exists (FIXES RENDER CRASH)
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Catch crashes (VERY IMPORTANT)
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT ERROR:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED PROMISE:", err);
});

const app = express();
const PORT = process.env.PORT || 5000;
const upload = multer({ dest: "uploads/" });

// ✅ CORS FIXED (no trailing slash)
app.use(cors({
  origin: process.env.FRONTEND_URL || "https://intellix-nu.vercel.app",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true
}));
app.options(/.*/, cors());
app.use(express.json());

const mistral = process.env.MISTRALAI_API_KEY
  ? new Mistral({ apiKey: process.env.MISTRALAI_API_KEY })
  : null;

// --- HELPER: Get internal UUID from Clerk ID ---
const getInternalId = async (clerkId) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_id", clerkId)
    .single();

  if (error || !data) return null;
  return data.id;
};

// --- HELPER: Extract text from uploaded file ---
const extractTextFromFile = async (filePath, originalName) => {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === ".pdf") {
    // const buffer = fs.readFileSync(filePath);
    // const uint8Array = new Uint8Array(buffer);

    // const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    // let text = "";

    // for (let i = 1; i <= pdf.numPages; i++) {
    //   const page = await pdf.getPage(i);
    //   const content = await page.getTextContent();
    //   text += content.items.map((item) => item.str).join(" ") + "\n";
    // }

    // return text;
    return "PDF parsing temporarily disabled";
  }

  if (ext === ".docx" || ext === ".doc") {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8");
  }

  return null;
};

// ================= ROUTES =================

// 1. Sync User
app.post("/api/user", async (req, res) => {
  try {
    const { clerkId, name, email, imageUrl } = req.body;

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        { clerk_id: clerkId, name, email, image_url: imageUrl },
        { onConflict: "clerk_id" }
      )
      .select();

    if (error) throw error;

    res.status(200).json({ user: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Create Chat
app.post("/api/chats", async (req, res) => {
  try {
    const { clerkId, title } = req.body;

    const userId = await getInternalId(clerkId);
    if (!userId) return res.status(404).json({ error: "Profile not found" });

    const { data, error } = await supabase
      .from("chats")
      .insert({ user_id: userId, title, clerk_id: clerkId })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ chat: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get Chats
app.get("/api/chats/:clerkId", async (req, res) => {
  try {
    const { clerkId } = req.params;

    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("clerk_id", clerkId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.status(200).json({ chats: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Upload File
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { chatId } = req.body;

    if (!file) return res.status(400).json({ error: "No file uploaded" });
    if (!chatId) return res.status(400).json({ error: "chatId is required" });

    const extractedText = await extractTextFromFile(file.path, file.originalname);

    if (!extractedText?.trim()) {
      return res.status(400).json({ error: "Could not extract text" });
    }

    const { data, error } = await supabase
      .from("chat_files")
      .insert({
        chat_id: chatId,
        file_name: file.originalname,
        content: extractedText
      })
      .select()
      .single();

    if (error) throw error;

    fs.unlinkSync(file.path);

    res.status(200).json({ file: data });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// 5. Chat AI
app.post("/api/chat", async (req, res) => {
  try {
    if (!mistral) {
      return res.status(500).json({ error: "Mistral API key missing" });
    }

    const { prompt, domain, chatId } = req.body;

    let context = null;

    if (chatId) {
      const { data: files } = await supabase
        .from("chat_files")
        .select("file_name, content")
        .eq("chat_id", chatId);

      if (files?.length) {
        context = files.map(f =>
          `--- ${f.file_name} ---\n${f.content}`
        ).join("\n\n");
      }
    }

    const systemPrompt = context
      ? `Answer ONLY using these docs:\n${context}`
      : `You are expert in ${domain}`;

    const response = await mistral.chat.complete({
      model: "ministral-14b-2512",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ]
    });

    res.json({
      answer: response.choices[0].message.content
    });

  } catch (error) {
    console.error("AI error:", error);
    res.status(500).json({ error: "AI failed" });
  }
});

// 6. Get Messages
app.get("/api/messages/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.status(200).json({ messages: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Save Message
app.post("/api/messages", async (req, res) => {
  try {
    const { chatId, role, content } = req.body;
    const { data, error } = await supabase
      .from("messages")
      .insert({ chat_id: chatId, role, content })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Update Chat Title
app.patch("/api/chats/:chatId/title", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { title } = req.body;
    const { data, error } = await supabase
      .from("chats")
      .update({ title })
      .eq("id", chatId)
      .select()
      .single();

    if (error) throw error;
    res.status(200).json({ chat: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});