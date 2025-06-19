import genAI from "../config/gemini.config.js";
import { Message } from "../models/message.model.js";
import { ApiError } from "../utils/ApiError.js";

const generateAIResponse = async (conversationId, userId, onChunk = null) => {
  try {
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .select("content role");

    const recentMessages = messages.slice(-10).map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL });
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [
            { text: "You are a helpful assistant. Keep responses concise." },
          ],
        },
        {
          role: "model",
          parts: [
            { text: "Okay, I understand. I will keep my responses concise." },
          ],
        },
        ...recentMessages,
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200,
      },
    });

    const lastUserMessage = recentMessages[recentMessages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== "user") {
      throw new ApiError(500, "No valid user message to send to AI.");
    }

    // For streaming responses (WebSocket)
    if (onChunk) {
      let fullResponse = "";
      const result = await chat.sendMessageStream(
        lastUserMessage.parts[0].text
      );

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        onChunk(chunkText);
      }

      return await saveAIMessage(conversationId, userId, fullResponse);
    }
    // For regular HTTP responses
    else {
      const result = await chat.sendMessage(lastUserMessage.parts[0].text);
      const response = await result.response;
      const aiContent = response.text();

      if (!aiContent?.trim()) {
        throw new ApiError(500, "Failed to get a valid response from AI.");
      }

      return await saveAIMessage(conversationId, userId, aiContent);
    }
  } catch (error) {
    console.error("[AI Service Error]", error);
    throw new ApiError(500, error.message || "Failed to generate AI response");
  }
};

async function saveAIMessage(conversationId, userId, content) {
  return await Message.create({
    userId,
    conversationId,
    content,
    role: "assistant",
    status: "delivered",
    metadata: { type: "text" },
  });
}

export { generateAIResponse };
