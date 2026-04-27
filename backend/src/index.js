import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { supabase } from "./config/supabase.js";
import fs from "fs";
import path from "path";
import { Mistral } from "@mistralai/mistralai";

dotenv.config();

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT ERROR:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED PROMISE:", err);
});

const app = express();
const PORT = process.env.PORT || 5000;
const upload = multer({ dest: "uploads/" });

const allowedOrigins = [
  "https://intellix-nu.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
}));
app.options(/.*/, cors());
app.use(express.json());

const mistral = process.env.MISTRALAI_API_KEY
  ? new Mistral({ apiKey: process.env.MISTRALAI_API_KEY })
  : null;

const getInternalId = async (clerkId) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_id", clerkId)
    .single();

  if (error || !data) return null;
  return data.id;
};

const extractTextFromFile = async (filePath, originalName) => {
  const ext = path.extname(originalName).toLowerCase();

  // Plain text — no API needed
  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8");
  }

  // PDF — use Mistral OCR
  if (ext === ".pdf") {
  const fileBuffer = fs.readFileSync(filePath);

  const uploadedPdf = await mistral.files.upload({
    file: { fileName: originalName, content: fileBuffer },
    purpose: "ocr",
  });
  console.log("Mistral file uploaded, id:", uploadedPdf.id); // 👈

  const signedUrl = await mistral.files.getSignedUrl({ fileId: uploadedPdf.id });
  console.log("Got signed URL:", signedUrl.url); // 👈

  const ocrResponse = await mistral.ocr.process({
    model: "mistral-ocr-latest",
    document: { type: "document_url", documentUrl: signedUrl.url },
  });
  console.log("OCR pages count:", ocrResponse.pages?.length); // 👈
  console.log("First page sample:", ocrResponse.pages?.[0]?.markdown?.slice(0, 200)); // 👈

  const text = ocrResponse.pages.map((page) => page.markdown).join("\n\n");
  return text;
}

  // DOCX / DOC — use Mistral OCR as well
  if (ext === ".docx" || ext === ".doc") {
    const fileBuffer = fs.readFileSync(filePath);

    const uploadedDoc = await mistral.files.upload({
      file: {
        fileName: originalName,
        content: fileBuffer,
      },
      purpose: "ocr",
    });

    const signedUrl = await mistral.files.getSignedUrl({
      fileId: uploadedDoc.id,
    });

    const ocrResponse = await mistral.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: signedUrl.url,
      },
    });

    const text = ocrResponse.pages
      .map((page) => page.markdown)
      .join("\n\n");

    await mistral.files.delete({ fileId: uploadedDoc.id }).catch(() => {});

    return text;
  }

  return null;
};

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

// 4. Get Files for a Chat
app.get("/api/files/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { data, error } = await supabase
      .from("chat_files")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.status(200).json({ files: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Delete a File
app.delete("/api/files/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { error } = await supabase
      .from("chat_files")
      .delete()
      .eq("id", fileId);

    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Upload File
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { chatId } = req.body;

    if (!file) return res.status(400).json({ error: "No file uploaded" });
    if (!chatId) return res.status(400).json({ error: "chatId is required" });
    if (!mistral) return res.status(500).json({ error: "Mistral API key missing" });

    console.log("Starting OCR for:", file.originalname);
    const extractedText = await extractTextFromFile(file.path, file.originalname);
    console.log("Extracted text:", extractedText?.slice(0, 300)); // 👈 see what came back

    if (!extractedText?.trim()) {
      return res.status(400).json({ error: "Could not extract text from file" });
    }

    const { data, error } = await supabase
      .from("chat_files")
      .insert({
        chat_id: chatId,
        file_name: file.originalname,
        content: extractedText,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(200).json({ file: data });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// 7. Chat AI
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
        context = files
          .map((f) => `--- ${f.file_name} ---\n${f.content}`)
          .join("\n\n");
      }
    }

    const systemPrompt = context
      ? `You are a helpful assistant. Answer based on the following documents:\n\n${context}`
      : `You are an expert in ${domain}`;

    const response = await mistral.chat.complete({
      model: "ministral-14b-2512",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    res.json({ answer: response.choices[0].message.content });
  } catch (error) {
    console.error("AI error:", error);
    res.status(500).json({ error: "AI failed" });
  }
});

// 8. Get Messages
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

// 9. Save Message
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

// 10. Update Chat Title
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