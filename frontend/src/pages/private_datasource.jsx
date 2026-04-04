import React, { useState, useRef, useEffect } from "react";
import {
  Paperclip, Upload, X, FileText, CheckCircle2,
  Loader2, FileImage, FileSpreadsheet, File, Trash2,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "${VITE_BACKEND_URL}";

const getFileIcon = (fileName) => {
  const ext = fileName?.split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif"].includes(ext))
    return <FileImage className="w-3.5 h-3.5" style={{ color: "#6b9fd4" }} />;
  if (["xls", "xlsx", "csv"].includes(ext))
    return <FileSpreadsheet className="w-3.5 h-3.5" style={{ color: "#6dab7f" }} />;
  if (ext === "pdf")
    return <FileText className="w-3.5 h-3.5" style={{ color: "#c47a7a" }} />;
  return <File className="w-3.5 h-3.5" style={{ color: "#666666" }} />;
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const PrivateDatasource = ({ chatId }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [fetchingFiles, setFetchingFiles] = useState(false);
  const fileInputRef = useRef(null);

  const ACCEPTED = [".pdf", ".doc", ".docx", ".txt"];

  useEffect(() => {
    if (!chatId) { setUploadedFiles([]); return; }
    const fetchFiles = async () => {
      setFetchingFiles(true);
      try {
        const res = await fetch(`${VITE_BACKEND_URL}/api/files/${chatId}`);
        const data = await res.json();
        setUploadedFiles(data.files || []);
      } catch (err) {
        console.error("Failed to fetch files:", err);
      } finally {
        setFetchingFiles(false);
      }
    };
    fetchFiles();
  }, [chatId]);

  const validateAndSet = (selectedFile) => {
    setError(null);
    setSuccess(false);
    const ext = "." + selectedFile.name.split(".").pop().toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setError(`Unsupported type. Use: ${ACCEPTED.join(", ")}`);
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("File exceeds 10MB limit.");
      return;
    }
    setFile(selectedFile);
  };

  const handleFileUpload = async () => {
    if (!file || !chatId) {
      setError(!chatId ? "No active chat. Start a conversation first." : "No file selected.");
      return;
    }
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("chatId", chatId);
    try {
      const response = await fetch(`${VITE_BACKEND_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Upload failed");
      }
      const data = await response.json();
      setUploadedFiles((prev) => [data.file, ...prev]);
      setSuccess(true);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message || "Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await fetch(`${VITE_BACKEND_URL}/api/files/${fileId}`, { method: "DELETE" });
      setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  return (
    <div
      className="min-h-screen p-6"
      style={{ background: "#0a0a0a" }}
    >
      <div className="max-w-xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#e5e5e5" }}>
            Private Datasource
          </h1>
          <p className="text-sm mt-1" style={{ color: "#555555" }}>
            Upload files to this chat. The AI will only answer from these documents.
          </p>

          {/* Chat status badge */}
          <div
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={chatId
              ? { background: "#0f1f0f", color: "#6dab7f", border: "1px solid #1a3a1a" }
              : { background: "#1f1a0f", color: "#a08040", border: "1px solid #3a2a0a" }
            }
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: chatId ? "#6dab7f" : "#a08040" }}
            />
            {chatId ? "Chat active" : "No active chat - start a conversation first"}
          </div>
        </div>

        {/* Upload Card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "#111111", border: "1px solid #1e1e1e" }}
        >
          {/* Card header */}
          <div
            className="p-5"
            style={{ borderBottom: "1px solid #1e1e1e" }}
          >
            <h2 className="text-sm font-semibold" style={{ color: "#aaaaaa" }}>
              Upload Document
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "#444444" }}>
              PDF, DOC, DOCX, TXT — max 10MB
            </p>
          </div>

          <div className="p-5 space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              id="file-upload"
              onChange={(e) => e.target.files?.[0] && validateAndSet(e.target.files[0])}
              className="hidden"
              accept={ACCEPTED.join(",")}
              disabled={!chatId}
            />

            {/* Drop Zone */}
            {!file && !success && (
              <label
                htmlFor="file-upload"
                onDragOver={(e) => { e.preventDefault(); if (chatId) setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (e.dataTransfer.files?.[0] && chatId) validateAndSet(e.dataTransfer.files[0]);
                }}
                className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl transition-all duration-200"
                style={{
                  border: dragging
                    ? "2px dashed #555555"
                    : "2px dashed #222222",
                  background: dragging ? "#161616" : "transparent",
                  cursor: !chatId ? "not-allowed" : "pointer",
                  opacity: !chatId ? 0.4 : 1,
                }}
              >
                <div
                  className="p-3 rounded-full"
                  style={{ background: dragging ? "#1e1e1e" : "#161616" }}
                >
                  <Paperclip
                    className="w-5 h-5"
                    style={{ color: dragging ? "#888888" : "#444444" }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold" style={{ color: "#888888" }}>
                    {!chatId
                      ? "Start a chat first"
                      : dragging
                      ? "Drop it here!"
                      : "Drag & drop or click to browse"}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#3a3a3a" }}>
                    PDF · DOC · DOCX · TXT
                  </p>
                </div>
              </label>
            )}

            {/* File Preview */}
            {file && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid #2a2a2a", background: "#0d0d0d" }}
              >
                <div className="flex items-center gap-3 p-3">
                  <div
                    className="p-2 rounded-lg shrink-0"
                    style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}
                  >
                    {getFileIcon(file.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "#e5e5e5" }}>
                      {file.name}
                    </p>
                    <p className="text-xs" style={{ color: "#555555" }}>
                      {formatSize(file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="p-1.5 rounded-full transition-colors"
                    style={{ color: "#555555" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#1e1e1e"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={handleFileUpload}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold h-9 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "#e5e5e5", color: "#0a0a0a" }}
                    onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "#cccccc"; }}
                    onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = "#e5e5e5"; }}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                    ) : (
                      <><Upload className="w-4 h-4" /> Confirm Upload</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Success */}
            {success && (
              <div
                className="flex items-center gap-3 p-4 rounded-xl"
                style={{
                  background: "#0f1f0f",
                  border: "1px solid #1a3a1a",
                }}
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "#6dab7f" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#6dab7f" }}>
                    Upload Successful!
                  </p>
                  <p className="text-xs" style={{ color: "#4a7a5a" }}>
                    This file is now part of your chat's knowledge base.
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                className="flex items-start gap-2 p-3 rounded-xl"
                style={{
                  background: "#1f0f0f",
                  border: "1px solid #3a1a1a",
                }}
              >
                <X className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#c47a7a" }} />
                <p className="text-sm" style={{ color: "#c47a7a" }}>{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Uploaded Files List */}
        {chatId && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "#111111", border: "1px solid #1e1e1e" }}
          >
            <div
              className="p-5 flex items-center justify-between"
              style={{ borderBottom: "1px solid #1e1e1e" }}
            >
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "#aaaaaa" }}>
                  Chat Files
                </h2>
                <p className="text-[11px] mt-0.5" style={{ color: "#444444" }}>
                  Files attached to the current chat
                </p>
              </div>
              {uploadedFiles.length > 0 && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: "#1a1a1a",
                    color: "#888888",
                    border: "1px solid #2a2a2a",
                  }}
                >
                  {uploadedFiles.length} file{uploadedFiles.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="p-3 space-y-1.5">
              {fetchingFiles ? (
                <div className="flex items-center gap-2 p-2">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#444444" }} />
                  <span className="text-sm" style={{ color: "#444444" }}>Loading files...</span>
                </div>
              ) : uploadedFiles.length === 0 ? (
                <div className="text-center py-6">
                  <File className="w-8 h-8 mx-auto mb-2" style={{ color: "#222222" }} />
                  <p className="text-sm" style={{ color: "#444444" }}>
                    No files attached to this chat yet.
                  </p>
                </div>
              ) : (
                uploadedFiles.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg group transition-colors"
                    style={{ background: "#0d0d0d", border: "1px solid #1e1e1e" }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "#2a2a2a"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1e1e1e"}
                  >
                    {getFileIcon(f.file_name)}
                    <span
                      className="text-sm truncate flex-1"
                      style={{ color: "#aaaaaa" }}
                    >
                      {f.file_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(f.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all"
                      style={{ color: "#c47a7a" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#1f0f0f"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivateDatasource;