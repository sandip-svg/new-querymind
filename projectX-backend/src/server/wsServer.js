import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { Message } from "../models/message.model.js";
import { Conversation } from "../models/conversation.model.js";
import { generateAIResponse } from "../services/ai.service.js";

const activeConnections = new Map();

export const setupWebSocketServer = (server) => {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    try {
      const token = req.url.split("token=")[1];
      if (!token) throw new Error("No token provided");

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const userId = decoded._id;

      activeConnections.set(userId, ws);
      console.log(`User ${userId} connected`);

      ws.send(
        JSON.stringify({
          type: "connection_success",
          message: "WebSocket connection established",
        })
      );

      ws.on("message", async (message) => {
        try {
          const data = JSON.parse(message);

          switch (data.type) {
            case "ping":
              ws.send(JSON.stringify({ type: "pong" }));
              break;

            case "user_message":
              await handleUserMessage(userId, data);
              break;

            default:
              console.warn("Unknown message type:", data.type);
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      });

      ws.on("close", () => {
        activeConnections.delete(userId);
        console.log(`User ${userId} disconnected`);
      });
    } catch (error) {
      console.error("WebSocket authentication failed:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Authentication failed",
        })
      );
      ws.close();
    }
  });
};

async function handleUserMessage(userId, data) {
  const { content, conversationId } = data;
  const ws = activeConnections.get(userId);

  try {
    // Verify conversation belongs to user
    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
    });
    if (!conversation) throw new Error("Invalid conversation");

    // Save user message
    const userMessage = await Message.create({
      userId,
      conversationId,
      content,
      role: "user",
      status: "delivered",
    });

    // Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { updatedAt: new Date() },
    });

    // Send typing indicator
    ws.send(
      JSON.stringify({
        type: "typing_indicator",
        conversationId,
      })
    );

    // Generate and send AI response
    const aiMessage = await generateAIResponse(conversationId, userId);

    ws.send(
      JSON.stringify({
        type: "ai_response",
        conversationId,
        content: aiMessage.content,
      })
    );
  } catch (error) {
    console.error("Error handling user message:", error);
    ws?.send(
      JSON.stringify({
        type: "error",
        message: error.message || "Failed to process message",
      })
    );
  }
}
