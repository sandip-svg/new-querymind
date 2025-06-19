import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const app = express();

const server = http.createServer(app);

app.use(
  cors({
    origin: [`http://localhost:3000`, `http://127.0.0.1:3000`],
    credentials: true,
  }),
);


app.use(helmet());
app.use(
  helmet.hsts({
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  })
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static(path.join(__dirname, '../projectX-frontend')));
app.use(cookieParser());

// import route
import userRouter from "./routes/user.route.js";
import conversationRouter from "./routes/conversation.route.js";
import messageRouter from "./routes/message.route.js";

//user routes declaration
app.use("/api/v1/users", userRouter);

//conversation routes declaration
app.use("/api/v1/conversations", conversationRouter);

//message routes declaration
app.use("/api/v1/messages", messageRouter);

app.get("/test-path", (req, res) => {
  const testPath = path.join(
    __dirname,
    "../../frontend/auth/verification-success.html"
  );
  res.send({
    path: testPath,
    exists: fs.existsSync(testPath),
  });
});

// Final global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  return res.status(statusCode).json({
    success: false,
    message,
    errors: err.errors || [],
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});


export { app, server };  // Change from default export to named exports
