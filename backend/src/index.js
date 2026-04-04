import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Mistral } from "@mistralai/mistralai";
import multer from "multer";
import { supabase } from "./config/supabase.js";
import fs from "fs";
import path from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const upload = multer({ dest: "uploads/" });
const frontend_url = process.env.FRONTEND_URL;

app.use(cors({
  origin: frontend_url,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

const mistral = new Mistral({ apiKey: process.env.MISTRALAI_API_KEY });

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
    const buffer = fs.readFileSync(filePath);
    const uint8Array = new Uint8Array(buffer);
    const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + "\n";
    }
    return text;
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

// 1. Sync User Info
app.post("/api/user", async (req, res) => {
  const { clerkId, name, email, imageUrl } = req.body;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        { clerk_id: clerkId, name, email, image_url: imageUrl },
        { onConflict: "clerk_id" },
      )
      .select();
    if (error) throw error;
    res.status(200).json({ user: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Create a new chat
app.post("/api/chats", async (req, res) => {
  const { clerkId, title } = req.body;
  try {
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

// 3. Get chats for a user
app.get("/api/chats/:clerkId", async (req, res) => {
  const { clerkId } = req.params;
  try {
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

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { chatId } = req.body;

    if (!file) return res.status(400).json({ error: "No file uploaded" });
    if (!chatId) return res.status(400).json({ error: "chatId is required" });

    const extractedText = await extractTextFromFile(file.path, file.originalname);

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({ error: "Could not extract text from file" });
    }

    const { data, error } = await supabase
      .from("chat_files")
      .insert({ chat_id: chatId, file_name: file.originalname, content: extractedText })
      .select()
      .single();

    if (error) throw error;

    fs.unlinkSync(file.path);

    res.status(200).json({ file: data }); // ✅ returns { file: { id, file_name, ... } }
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "File upload failed" });
  }
});

// 5. Get files for a chat
app.get("/api/files/:chatId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("chat_files")
      .select("id, file_name, created_at")
      .eq("chat_id", req.params.chatId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.status(200).json({ files: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Delete a file
app.delete("/api/files/:fileId", async (req, res) => {
  try {
    const { error } = await supabase
      .from("chat_files")
      .delete()
      .eq("id", req.params.fileId);
    if (error) throw error;
    res.status(200).json({ message: "File deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. RAG Chat — answers only from uploaded files
app.post("/api/chat", async (req, res) => {
  const { prompt, domain, chatId } = req.body;

  try {
    // If chatId provided, fetch all file contents for that chat
    let context = null;
    if (chatId) {
      const { data: files, error } = await supabase
        .from("chat_files")
        .select("file_name, content")
        .eq("chat_id", chatId);

      if (!error && files && files.length > 0) {
        context = files
          .map((f) => `--- File: ${f.file_name} ---\n${f.content}`)
          .join("\n\n");
      }
    }

    const systemPrompt = context
      ? `You are an expert assistant. The user has uploaded documents for this chat session. 
Answer the user's question ONLY using the information found in these documents.
If the answer is not found in the documents, respond with exactly: "I couldn't find an answer to that in the uploaded documents."
Do not use any external knowledge.

DOCUMENTS:
${context}`
      : `You are an expert in ${domain}. Answer the user's question clearly and concisely.`;

    const response = await mistral.chat.complete({
      model: "ministral-14b-2512",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    const finalAnswer = response.choices[0].message.content;
    res.json({ answer: finalAnswer, domain });
  } catch (error) {
    console.error("Mistral error:", error);
    res.status(500).json({ error: "Mistral failed" });
  }
});

// 8. Store message
app.post("/api/messages", async (req, res) => {
  const { chatId, role, content, domain } = req.body;
  try {
    const { data, error } = await supabase
      .from("messages")
      .insert({ chat_id: chatId, role, content, domain })
      .select();
    if (error) throw error;
    res.status(201).json({ message: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Get messages for a chat
app.get("/api/messages/:chatId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", req.params.chatId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.status(200).json({ messages: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/chats/:chatId/title", async (req, res) => {
  const { chatId } = req.params;
  const { title } = req.body;
  try {
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));