const http = require("http");
const fs = require("fs");
const path = require("path");
const db = require("./database");
const { Server } = require("socket.io");

const cookie = require("cookie");

const pathTolIndex = path.join(__dirname, "static", "index.html");
const indexHtmlFile = fs.readFileSync(pathTolIndex);

const pathToIndexCss = path.join(__dirname, "static", "style.css");

const indexCssFile = fs.readFileSync(pathToIndexCss);

const pathToRegisterHtml = path.join(__dirname, "static", "register.html");
const RegisterHtmlFile = fs.readFileSync(pathToRegisterHtml);

const pathToLoginHtml = path.join(__dirname, "static", "login.html");
const LoginHtmlFile = fs.readFileSync(pathToLoginHtml);

const pathToIndexJs = path.join(__dirname, "static", "script.js");
const indexJsFile = fs.readFileSync(pathToIndexJs);

const pathToAuthJs = path.join(__dirname, "static", "auth.js");
const authJsFile = fs.readFileSync(pathToAuthJs);

const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    switch (req.url) {
      // case "/":
      //   return res.end(indexHtmlFile);
      case "/style.css":
        return res.end(indexCssFile);
      case "/script.js":
        return res.end(indexJsFile);
      case "/register":
        return res.end(RegisterHtmlFile);
      case "/login":
        return res.end(LoginHtmlFile);
      case "/auth.js":
        return res.end(authJsFile);
      default:
        return guarded(req, res);
    }
  }
  if (req.method === "POST") {
    switch (req.url) {
      case "/api/register":
        return registerUser(req, res);
      case "/api/login":
        return login(req, res);
      default:
        return guarded(req, res);
    }
  }

  res.statusCode = 404;
  return res.end("Error 404");
});

function guarded(req, res) {
  const credentionals = getCredetionals(req.headers?.cookie);
  if (!credentionals) {
    res.writeHead(302, { Location: "/register" });
    return res.end();
  }
  if (req.method === "GET") {
    switch (req.url) {
      case "/":
        return res.end(indexHtmlFile);
      case "/script.js":
        return res.end(indexJsFile);
    }
    res.writeHead(404);
    return res.end("Error 404");
  }
}

function getCredetionals(c = "") {
  const cookies = cookie.parse(c);
  const token = cookies?.token;
  if (!token || !validAuthTokens.includes(token)) return null;
  const [user_id, login] = token.split(".");
  if (!user_id || !login) return null;
  return { user_id, login };
}

const validAuthTokens = [];

function login(req, res) {
  let data = "";
  req.on("data", function (chunk) {
    data += chunk;
  });
  req.on("end", async function () {
    try {
      const user = JSON.parse(data);
      const token = await db.getAuthToken(user);
      validAuthTokens.push(token);
      res.writeHead(200);
      res.end(token);
    } catch (e) {
      res.writeHead(500);
      return res.end("Error: " + e);
    }
  });
}

function registerUser(req, res) {
  let data = "";
  req.on("data", function (chunk) {
    data += chunk;
  });
  req.on("end", async function () {
    try {
      const user = JSON.parse(data);
      if (!user.login || !user.password) {
        return res.end("Empty login or password");
      }
      if (await db.isUserExist(user.login)) {
        return res.end("User already exist");
      }
      await db.addUser(user);
      return res.end("Register is successfull");
    } catch (e) {
      return res.end("Error" + e);
    }
  });
}

server.listen(3000);

const io = new Server(server);

io.use((socket, next) => {
  const cookie = socket.handshake.auth.cookie;
  const credentionals = getCredetionals(cookie);
  if (!credentionals) {
    next(new Error("no auth"));
  }
  socket.credentionals = credentionals;
  next();
});

io.on("connection", async (socket) => {
  console.log("User id is" + socket.id);

  let userNickname = socket.credentionals?.login;
  let userId = socket.credentionals?.user_id;
  let messages = await db.getMessages();
  socket.emit("all_messages", messages);

  socket.on("set_nickname", (nickname) => {
    userNickname = nickname;
  });

  socket.on("new_message", (message) => {
    db.addMessage(message, userId);
    io.emit("message", userNickname + " : " + message);
  });
});
