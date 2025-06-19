import dotenv from "dotenv";
import connectDB from "./db/index.js";
import {app,server} from "./app.js";
import { setupWebSocketServer } from "./server/wsServer.js";  // Updated path


dotenv.config({
  path: "./.env",
});

connectDB()
  .then(() => {
      server.listen(process.env.PORT || 3000, () => {
      console.log(`server is running at port ${process.env.PORT}`);
    });

    // Setup WebSocket server
    setupWebSocketServer(server);

    app.on("error", (error) => {
      console.log(error);
      throw error;
    });
  })
  .catch((err) => {
    console.log("MONGODB connection failed !!", err);
  });
