export const API_BASE_URL = "http://localhost:8000/api/v1";

async function makeRequest(endpoint, method, body = null, requiresAuth = true) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (requiresAuth) {
    const token = localStorage.getItem("accessToken");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const config = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}

// Auth endpoints
export const authAPI = {
  register: (userData) =>
    makeRequest("/users/register", "POST", userData, false),
  login: (credentials) =>
    makeRequest("/users/login", "POST", credentials, false),
  logout: () => makeRequest("/users/logout", "POST"),
  verifyEmail: (token) =>
    makeRequest(`/users/verify-email/${token}`, "GET", null, false),
  forgotPassword: (email) =>
    makeRequest("/users/forget-password", "POST", { email }, false),
  resetPassword: (token, passwords) =>
    makeRequest(`/users/reset-password/${token}`, "POST", passwords, false),
  getCurrentUser: () => makeRequest("/users/current-user", "GET"),
};

// Chat endpoints
export const chatAPI = {
  getConversations: () =>
    makeRequest("/conversations/get-conversations", "GET"),
  createConversation: (title) =>
    makeRequest("/conversations/create-conversation", "POST", { title }),
  getMessages: (conversationId) =>
    makeRequest(`/messages/get-message/${conversationId}`, "GET"),
  sendMessage: (conversationId, content) =>
    makeRequest(`/messages/create-message/${conversationId}`, "POST", {
      content,
    }),
};
