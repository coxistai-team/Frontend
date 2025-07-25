import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPresentationSchema, insertNoteSchema, insertDocumentSchema, updateUserProfileSchema, insertPresentationSchema as insertCalendarEventSchema, community_posts } from "@shared/schema";
import multer from "multer";
import { exec, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { globSync } from "glob";

// --- AUTH & EMAIL UTILS ---
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
// @ts-ignore // If you see a type error, run: npm install resend
import { Resend } from 'resend';
import cookie from "cookie";
import cors from "cors";

// Extend Express Request type to include 'user'
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
const JWT_EXPIRES_IN = "7d";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

function signJwt(payload: object, options?: jwt.SignOptions) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, ...options });
}

function verifyJwt(token: string) {
  try {
  return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Auth middleware
const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    const user = verifyJwt(token);
    if (user) {
      req.user = user;
      next();
    } else {
      res.sendStatus(403); // Forbidden
    }
  } else {
    res.sendStatus(401); // Unauthorized
  }
};

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
if (!resend) {
  console.warn("Resend API key not found. Email services will be disabled.");
}

const sendPasswordResetEmail = async (email: string, token: string) => {
  try {
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
    const html = `<p>Hello,</p><p>You requested a password reset for your account. Click the link below to reset your password:</p><p><a href='${resetUrl}'>Reset Password</a></p><p>If you did not request this, you can safely ignore this email.</p>`;
    await resend?.emails.send({
      from: `Support <${RESEND_FROM_EMAIL}>`,
      to: [email],
      subject: 'Reset your password',
      html,
    });
  } catch (err) {
    // Log error but do not leak to user
    console.error('[Resend Error]', err);
  }
};

const signupSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
const loginSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

// --- AUTH MIDDLEWARE ---
function getTokenFromRequest(req: Request) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  if (req.headers.cookie) {
    const cookies = cookie.parse(req.headers.cookie);
    if (cookies.token) return cookies.token;
  }
  return null;
}
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "Missing or invalid authorization" });
  try {
    req.user = verifyJwt(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// --- AUTH ENDPOINTS ---
export async function registerAuthRoutes(app: Express) {
  // Add specific CORS options for auth routes
  const authCorsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`Auth route: Origin ${origin} not allowed by CORS`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  };

  // Signup
  app.options('/api/auth/signup', cors(authCorsOptions));
  app.post("/api/auth/signup", cors(authCorsOptions), async (req: Request, res: Response) => {
    try {
      const parse = signupSchema.safeParse(req.body);
      if (!parse.success) {
        return res.status(400).json({ error: "Please provide a valid username, email, and password." });
      }
      const { username, email, password } = parse.data;
      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(409).json({ error: "Username already exists." });
      const hashed = await hashPassword(password);
      const user = await storage.createUser({ username, password: hashed });
      await storage.updateUserProfile(user.id, { email });
      const token = signJwt({ id: user.id, username });
      res.status(201).json({ success: true, token });
    } catch {
      res.status(500).json({ error: "Signup failed. Please try again later." });
    }
  });

  // Login
  app.options('/api/auth/login', cors(authCorsOptions));
  app.post("/api/auth/login", cors(authCorsOptions), async (req: Request, res: Response) => {
    try {
      const parse = loginSchema.safeParse(req.body);
      if (!parse.success) {
        return res.status(400).json({ error: "Please provide a valid username and password." });
      }
      const { username, password } = parse.data;
      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(401).json({ error: "Incorrect credentials." });
      const valid = await comparePassword(password, user.password);
      if (!valid) return res.status(401).json({ error: "Incorrect credentials." });
      const token = signJwt({ id: user.id, username });
      res.json({ success: true, token });
    } catch {
      res.status(500).json({ error: "Login failed. Please try again later." });
    }
  });

  // Logout
  app.options('/api/auth/logout', cors(authCorsOptions));
  app.post("/api/auth/logout", cors(authCorsOptions), requireAuth, (req: Request, res: Response) => {
    try {
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Logout failed. Please try again later." });
    }
  });

  // Forgot Password
  app.options('/api/auth/forgot-password', cors(authCorsOptions));
  app.post("/api/auth/forgot-password", cors(authCorsOptions), async (req: Request, res: Response) => {
    try {
      const parse = forgotPasswordSchema.safeParse(req.body);
      if (!parse.success) {
        return res.status(400).json({ error: "Please provide a valid email address." });
      }
      const { email } = parse.data;
      const user = await storage.getUserByEmail(email);
      if (user) {
        const token = signJwt({ id: user.id, email }, { expiresIn: '1h' });
        await sendPasswordResetEmail(email, token);
      }
      res.json({ message: "If an account with that email exists, a reset link has been sent." });
    } catch {
      res.status(500).json({ error: "Failed to process reset request. Please try again later." });
    }
  });

  // Reset Password
  app.options('/api/auth/reset-password', cors(authCorsOptions));
  app.post("/api/auth/reset-password", cors(authCorsOptions), async (req: Request, res: Response) => {
    try {
      const parse = resetPasswordSchema.safeParse(req.body);
      if (!parse.success) {
        return res.status(400).json({ error: "Please provide a valid token and password (min 8 characters)." });
      }
      const { token, password } = parse.data;
      let payload;
      try { payload = verifyJwt(token); } catch { return res.status(400).json({ error: "Invalid or expired token." }); }
      const userId = (payload as any).id;
      if (!userId) return res.status(400).json({ error: "Invalid token." });
      const hashed = await hashPassword(password);
      await storage.updateUserPassword(userId, hashed);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to reset password. Please try again later." });
    }
  });

  // Me
  app.options('/api/auth/me', cors(authCorsOptions));
  app.get("/api/auth/me", cors(authCorsOptions), requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found." });
      const { password, ...userProfile } = user;
      res.json(userProfile);
    } catch {
      res.status(500).json({ error: "Failed to fetch user info. Please try again later." });
    }
  });
}

const execAsync = promisify(exec);

async function executeCode(code: string, language: string, input: string, tempDir: string, executionId: string) {
  const timeout = 10000; // 10 seconds timeout
  
  try {
    switch (language) {
      case "python":
        return await executePython(code, input, tempDir, executionId, timeout);
      case "javascript":
        return await executeJavaScript(code, input, tempDir, executionId, timeout);
      case "c":
        return await executeC(code, input, tempDir, executionId, timeout);
      case "cpp":
        return await executeCpp(code, input, tempDir, executionId, timeout);
      case "java":
        return await executeJava(code, input, tempDir, executionId, timeout);
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  } catch (error) {
    return {
      output: "",
      error: error instanceof Error ? error.message : "Execution failed",
      executionTime: 0
    };
  }
}

async function executePython(code: string, input: string, tempDir: string, executionId: string, timeout: number) {
  const fileName = `${executionId}.py`;
  const filePath = path.join(tempDir, fileName);
  
  await fs.writeFile(filePath, code);
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn("python3", [filePath], {
      cwd: tempDir,
      stdio: ["pipe", "pipe", "pipe"]
    });
    
    let output = "";
    let errorOutput = "";
    
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    
    child.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    // Send input if provided
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
    
    const timeoutId = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        output: output,
        error: "Execution timeout (10 seconds)",
        executionTime: Date.now() - startTime
      });
    }, timeout);
    
    child.on("close", (code) => {
      clearTimeout(timeoutId);
      fs.unlink(filePath).catch(() => {}); // Clean up file
      
      resolve({
        output: output,
        error: errorOutput || (code !== 0 ? `Process exited with code ${code}` : ""),
        executionTime: Date.now() - startTime
      });
    });
  });
}

async function executeJavaScript(code: string, input: string, tempDir: string, executionId: string, timeout: number) {
  const fileName = `${executionId}.js`;
  const filePath = path.join(tempDir, fileName);
  
  // Wrap code to handle input
  const wrappedCode = `
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let inputLines = \`${input}\`.split('\\n').filter(line => line.trim() !== '');
let inputIndex = 0;

// Override console.log to handle input simulation
const originalLog = console.log;
global.prompt = function(question) {
  if (inputIndex < inputLines.length) {
    const answer = inputLines[inputIndex++];
    originalLog(question + answer);
    return answer;
  }
  return '';
};

${code}

rl.close();
`;
  
  await fs.writeFile(filePath, wrappedCode);
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn("node", [filePath], {
      cwd: tempDir,
      stdio: ["pipe", "pipe", "pipe"]
    });
    
    let output = "";
    let errorOutput = "";
    
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    
    child.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
    
    const timeoutId = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        output: output,
        error: "Execution timeout (10 seconds)",
        executionTime: Date.now() - startTime
      });
    }, timeout);
    
    child.on("close", (code) => {
      clearTimeout(timeoutId);
      fs.unlink(filePath).catch(() => {});
      
      resolve({
        output: output,
        error: errorOutput || (code !== 0 ? `Process exited with code ${code}` : ""),
        executionTime: Date.now() - startTime
      });
    });
  });
}

async function executeC(code: string, input: string, tempDir: string, executionId: string, timeout: number) {
  const fileName = `${executionId}.c`;
  const executableName = `${executionId}_exec`;
  const filePath = path.join(tempDir, fileName);
  const execPath = path.join(tempDir, executableName);
  
  await fs.writeFile(filePath, code);
  
  try {
    // Compile the C code
    await execAsync(`gcc "${filePath}" -o "${execPath}"`, { cwd: tempDir, timeout: 5000 });
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      const child = spawn(execPath, [], {
        cwd: tempDir,
        stdio: ["pipe", "pipe", "pipe"]
      });
      
      let output = "";
      let errorOutput = "";
      
      child.stdout.on("data", (data) => {
        output += data.toString();
      });
      
      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });
      
      if (input) {
        child.stdin.write(input);
        child.stdin.end();
      }
      
      const timeoutId = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({
          output: output,
          error: "Execution timeout (10 seconds)",
          executionTime: Date.now() - startTime
        });
      }, timeout);
      
      child.on("close", (code) => {
        clearTimeout(timeoutId);
        // Clean up files
        fs.unlink(filePath).catch(() => {});
        fs.unlink(execPath).catch(() => {});
        
        resolve({
          output: output,
          error: errorOutput || (code !== 0 ? `Process exited with code ${code}` : ""),
          executionTime: Date.now() - startTime
        });
      });
    });
  } catch (compileError) {
    // Clean up source file
    fs.unlink(filePath).catch(() => {});
    return {
      output: "",
      error: `Compilation error: ${compileError}`,
      executionTime: 0
    };
  }
}

async function executeCpp(code: string, input: string, tempDir: string, executionId: string, timeout: number) {
  const fileName = `${executionId}.cpp`;
  const executableName = `${executionId}_exec`;
  const filePath = path.join(tempDir, fileName);
  const execPath = path.join(tempDir, executableName);
  
  await fs.writeFile(filePath, code);
  
  try {
    // Try to compile with g++ if available, fallback to gcc
    let compileCommand = `g++ "${filePath}" -o "${execPath}"`;
    try {
      await execAsync(compileCommand, { cwd: tempDir, timeout: 5000 });
    } catch {
      // Fallback to gcc for C++ (basic support)
      compileCommand = `gcc "${filePath}" -o "${execPath}" -lstdc++`;
      await execAsync(compileCommand, { cwd: tempDir, timeout: 5000 });
    }
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      const child = spawn(execPath, [], {
        cwd: tempDir,
        stdio: ["pipe", "pipe", "pipe"]
      });
      
      let output = "";
      let errorOutput = "";
      
      child.stdout.on("data", (data) => {
        output += data.toString();
      });
      
      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });
      
      if (input) {
        child.stdin.write(input);
        child.stdin.end();
      }
      
      const timeoutId = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({
          output: output,
          error: "Execution timeout (10 seconds)",
          executionTime: Date.now() - startTime
        });
      }, timeout);
      
      child.on("close", (code) => {
        clearTimeout(timeoutId);
        fs.unlink(filePath).catch(() => {});
        fs.unlink(execPath).catch(() => {});
        
        resolve({
          output: output,
          error: errorOutput || (code !== 0 ? `Process exited with code ${code}` : ""),
          executionTime: Date.now() - startTime
        });
      });
    });
  } catch (compileError) {
    fs.unlink(filePath).catch(() => {});
    return {
      output: "",
      error: `Compilation error: ${compileError}`,
      executionTime: 0
    };
  }
}

async function executeJava(code: string, input: string, tempDir: string, executionId: string, timeout: number) {
  // Extract class name from code
  const classMatch = code.match(/public\s+class\s+(\w+)/);
  const className = classMatch ? classMatch[1] : `Main${executionId}`;
  
  const fileName = `${className}.java`;
  const filePath = path.join(tempDir, fileName);
  
  // If no class found, wrap in a Main class
  let finalCode = code;
  if (!classMatch) {
    finalCode = `public class Main${executionId} {\n${code}\n}`;
  }
  
  await fs.writeFile(filePath, finalCode);
  
  try {
    // Compile Java code
    await execAsync(`javac "${filePath}"`, { cwd: tempDir, timeout: 5000 });
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      const child = spawn("java", [className], {
        cwd: tempDir,
        stdio: ["pipe", "pipe", "pipe"]
      });
      
      let output = "";
      let errorOutput = "";
      
      child.stdout.on("data", (data) => {
        output += data.toString();
      });
      
      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });
      
      if (input) {
        child.stdin.write(input);
        child.stdin.end();
      }
      
      const timeoutId = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({
          output: output,
          error: "Execution timeout (10 seconds)",
          executionTime: Date.now() - startTime
        });
      }, timeout);
      
      child.on("close", (code) => {
        clearTimeout(timeoutId);
        // Clean up files
        fs.unlink(filePath).catch(() => {});
        fs.unlink(path.join(tempDir, `${className}.class`)).catch(() => {});
        
        resolve({
          output: output,
          error: errorOutput || (code !== 0 ? `Process exited with code ${code}` : ""),
          executionTime: Date.now() - startTime
        });
      });
    });
  } catch (compileError) {
    fs.unlink(filePath).catch(() => {});
    return {
      output: "",
      error: `Compilation error: ${compileError}`,
      executionTime: 0
    };
  }
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Utility to delete a file if it exists
async function safeUnlink(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    // Ignore if file doesn't exist
  }
}
// Cleanup all files related to a presentation
async function cleanupPresentationFiles(presentation: any) {
  const id = presentation.id;
  const topic = presentation.topic;
  // 1. Remove PPTX
  await safeUnlink(path.join(process.cwd(), `${topic.replace(/ /g, '_')}_presentation_executive_elegance.pptx`));
  await safeUnlink(path.join(process.cwd(), "generated_ppts", `${topic.replace(/ /g, '_')}_presentation_executive_elegance.pptx`));
  // 2. Remove JSON
  await safeUnlink(path.join(process.cwd(), "presentation_json", `${id}_structure.json`));
  await safeUnlink(path.join(process.cwd(), "presentations", `${id}.json`));
  // 3. Remove images (all images with topic in filename)
  const imagesGlob = path.join(process.cwd(), "presentation_images", `${topic.replace(/ /g, '*')}*`);
  const imageFiles = globSync(imagesGlob);
  for (const img of imageFiles) {
    await safeUnlink(img);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  await registerAuthRoutes(app);
  // Document routes
  
  // Get all documents for a user
  app.get("/api/documents", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const documents = await storage.getDocuments(userId);
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  // Get a specific document
  app.get("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  // Get document by share code
  app.get("/api/shared/:shareCode", async (req: Request, res: Response) => {
    try {
      const { shareCode } = req.params;
      const document = await storage.getDocumentByShareCode(shareCode);
      
      if (!document) {
        return res.status(404).json({ error: "Shared document not found" });
      }
      
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shared document" });
    }
  });

  // Upload and create a new document
  app.post("/api/documents", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const { title, tags, isPublic, userId } = req.body;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Extract text content from file (basic implementation)
      let content = "";
      if (file.mimetype === "text/plain") {
        content = file.buffer.toString("utf-8");
      } else if (file.mimetype === "application/pdf") {
        content = "PDF content extraction not implemented - file uploaded successfully";
      } else {
        content = "File uploaded successfully - content extraction not supported for this file type";
      }

      const documentData = {
        title: title || file.originalname,
        filename: file.originalname,
        fileType: file.mimetype,
        content,
        tags: tags ? JSON.parse(tags) : [],
        isPublic: isPublic === "true",
        userId: parseInt(userId) || 1, // Default user for demo
      };

      const validatedData = insertDocumentSchema.parse(documentData);
      const document = await storage.createDocument({ ...validatedData, userId: documentData.userId });
      
      res.status(201).json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  // Update a document
  app.put("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const document = await storage.updateDocument(id, updates);
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  // Delete a document
  app.delete("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteDocument(id);
      if (!success) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Presentations API
  app.get('/api/presentations', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const presentations = await storage.getPresentationsByUser(userId);
      res.json(presentations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch presentations.' });
    }
  });

  app.get('/api/presentations/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const id = req.params.id;
      const presentation = await storage.getPresentationById(id, userId);
      if (!presentation) return res.status(404).json({ error: 'Presentation not found.' });
      res.json(presentation);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch presentation.' });
    }
  });

  app.post('/api/presentations', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const { id, topic, json_data } = req.body;
      if (!id || !topic || !json_data) return res.status(400).json({ error: 'Missing required fields.' });
      const created = await storage.createPresentation({ id, user_id: userId, topic, json_data });
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create presentation.' });
    }
  });

  app.put('/api/presentations/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const id = req.params.id;
      const { topic, json_data } = req.body;
      const updated = await storage.updatePresentation(id, userId, { topic, json_data });
      if (!updated) return res.status(404).json({ error: 'Presentation not found or not owned by user.' });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update presentation.' });
    }
  });

  // Delete a presentation
  app.delete('/api/presentations/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const id = req.params.id;
      const presentation = await storage.getPresentationById(id, userId);
      if (!presentation) return res.status(404).json({ error: 'Presentation not found or not owned by user.' });
      const success = await storage.deletePresentation(Number(id));
      if (!success) return res.status(404).json({ error: 'Presentation not found.' });
      // Cleanup files
      await cleanupPresentationFiles(presentation);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete presentation.' });
    }
  });

  // --- Slide Delete Route ---
  app.delete('/api/presentations/:id/slides/:slideIndex', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const id = req.params.id;
      const slideIndex = parseInt(req.params.slideIndex);
      if (isNaN(slideIndex)) return res.status(400).json({ error: 'Invalid slide index.' });
      const presentation = await storage.getPresentationById(id, userId);
      if (!presentation) return res.status(404).json({ error: 'Presentation not found.' });
      const json_data = presentation.json_data;
      if (!json_data || !Array.isArray(json_data.slides) || slideIndex < 0 || slideIndex >= json_data.slides.length) {
        return res.status(400).json({ error: 'Invalid slide index.' });
      }
      // Remove the slide
      json_data.slides.splice(slideIndex, 1);
      // Save updated presentation
      const updated = await storage.updatePresentation(id, userId, { json_data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete slide.' });
    }
  });

  // --- Calendar Events CRUD ---
  app.get("/api/calendar", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const events = await storage.getCalendarEvents(userId);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  app.get("/api/calendar/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      if (!userId || isNaN(Number(userId))) {
        return res.status(400).json({ error: "Invalid user id" });
      }
      const tasks = await storage.getCalendarTasks(Number(userId));
      res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch calendar tasks" });
    }
  });

  app.post("/api/calendar/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { title, date, priority } = req.body;
      if (!title || !date || !priority) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const created = await storage.createCalendarTask({ ...req.body, user_id: userId });
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: "Failed to create calendar task" });
    }
  });

  app.put("/api/calendar/tasks/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const id = parseInt(req.params.id);
      const task = await storage.getCalendarTask(id);
      if (!task || task.user_id !== userId) {
        return res.status(404).json({ error: "Task not found" });
      }
      const updated = await storage.updateCalendarTask(id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update calendar task" });
    }
  });

  app.delete("/api/calendar/tasks/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const id = parseInt(req.params.id);
      const task = await storage.getCalendarTask(id);
      if (!task || task.user_id !== userId) {
        return res.status(404).json({ error: "Task not found" });
      }
      await storage.deleteCalendarTask(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete calendar task" });
    }
  });

  app.get("/api/calendar/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const id = parseInt(req.params.id);
      const event = await storage.getCalendarEvent(id);
      if (!event || event.user_id !== userId) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  app.post("/api/calendar", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      // Use Zod validation if you have a schema, else basic check
      const { title, date, time, duration, type, color } = req.body;
      if (!title || !date || !time || !duration || !type || !color) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const created = await storage.createCalendarEvent({ ...req.body, user_id: userId });
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.put("/api/calendar/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const id = parseInt(req.params.id);
      const event = await storage.getCalendarEvent(id);
      if (!event || event.user_id !== userId) {
        return res.status(404).json({ error: "Event not found" });
      }
      const updated = await storage.updateCalendarEvent(id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/calendar/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const id = parseInt(req.params.id);
      const event = await storage.getCalendarEvent(id);
      if (!event || event.user_id !== userId) {
        return res.status(404).json({ error: "Event not found" });
      }
      await storage.deleteCalendarEvent(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // Get user profile
  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      let user = await storage.getUser(id);
      
      if (!user) {
        // Create default user if doesn't exist
        const defaultUser = {
          username: `user${id}`,
          password: 'default123',
          firstName: 'Sharath',
          lastName: 'Bandaari',
          email: 'sharath.bandaari@email.com',
          phone: '+1 (555) 123-4567',
          bio: 'AI enthusiast and lifelong learner passionate about technology and education.',
          location: 'San Francisco, CA',
          timezone: 'America/Los_Angeles',
          avatar: null,
          dateOfBirth: '1995-06-15',
          occupation: 'Software Engineer',
          company: 'Tech Innovations Inc.',
          theme: 'dark',
          emailNotifications: true,
          pushNotifications: true,
          marketingEmails: false,
          weeklyDigest: true,
          language: 'en',
          publicProfile: false,
        };
        
        const { firstName, lastName, email, phone, bio, location, timezone, avatar, dateOfBirth, occupation, company, theme, emailNotifications, pushNotifications, marketingEmails, weeklyDigest, language, publicProfile, ...userCreds } = defaultUser;
        const createdUser = await storage.createUser(userCreds);
        
        // Update the user with profile data
        user = await storage.updateUserProfile(createdUser.id, {
          firstName, lastName, email, phone, bio, location, timezone, avatar, dateOfBirth, occupation, company, theme, emailNotifications, pushNotifications, marketingEmails, weeklyDigest, language, publicProfile
        });
      }
      
      // Remove password from response
      const { password, ...userProfile } = user;
      res.json(userProfile);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  });

  // Update user profile
  app.put("/api/users/:id/profile", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const profileData = req.body;
      
      const validatedData = updateUserProfileSchema.parse(profileData);
      const updatedUser = await storage.updateUserProfile(id, validatedData);
      
      // Remove password from response
      const { password, ...userProfile } = updatedUser;
      res.json(userProfile);
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Code execution endpoint
  app.post("/api/execute", async (req: Request, res: Response) => {
    try {
      const { code, language, input = "" } = req.body;
      
      if (!code || !language) {
        return res.status(400).json({ error: "Code and language are required" });
      }

      const tempDir = "/tmp/code-exec";
      await fs.mkdir(tempDir, { recursive: true });
      
      const executionId = Date.now().toString();
      const result = await executeCode(code, language, input, tempDir, executionId);
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        error: "Failed to execute code", 
        output: "", 
        stderr: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // --- Community Posts CRUD ---
  app.get("/api/community/posts", async (req: Request, res: Response) => {
    try {
      const posts = await storage.getCommunityPosts();
      res.json(posts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch community posts" });
    }
  });

  // Get a single community post
  app.get("/api/community/posts/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const post = await storage.getCommunityPost(id);
      if (post) {
      res.json(post);
      } else {
        res.status(404).json({ error: "Post not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch post" });
    }
  });

  // Create a community post
  app.post("/api/community/posts", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title, content, category, tags } = req.body;
      const userId = req.user.id;
      const postData = { title, content, category, tags, user_id: userId };
      const post = await storage.createCommunityPost(postData);
      res.status(201).json(post);
    } catch (error) {
      res.status(500).json({ error: "Failed to create post" });
    }
  });

  // Update a community post
  app.put("/api/community/posts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      const { title, content, category, tags } = req.body;

      // First, verify the user owns the post
      const post = await storage.getCommunityPost(id);
      if (!post) {
        return res.status(404).json({ error: "Post not found." });
      }
      if (post.user_id !== userId) {
        return res.status(403).json({ error: "You are not authorized to edit this post." });
      }

      // Proceed with the update
      const updatedPost = await storage.updateCommunityPost(id, { title, content, category, tags });
      res.json(updatedPost);
    } catch (error) {
      res.status(500).json({ error: "Failed to update post." });
    }
  });

  // Delete a community post
  app.delete("/api/community/posts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      const success = await storage.deleteCommunityPost(id, userId);
      if (success) {
        res.sendStatus(204);
      } else {
        res.status(403).json({ error: "You are not authorized to delete this post or the post does not exist." });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete post" });
    }
  });


  // Create a reply to a post
  app.post("/api/community/posts/:id/replies", requireAuth, async (req: Request, res: Response) => {
    try {
      const post_id = parseInt(req.params.id);
      const { content } = req.body;
      const user_id = req.user.id;
      const replyData = { content, user_id, post_id };
      const reply = await storage.createCommunityReply(replyData);
      res.status(201).json(reply);
    } catch (error) {
      res.status(500).json({ error: "Failed to create reply" });
    }
  });

  // Delete a reply
  app.delete("/api/community/replies/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      const success = await storage.deleteCommunityReply(id, userId);
      if (success) {
        res.sendStatus(204);
      } else {
        res.status(403).json({ error: "You are not authorized to delete this reply or the reply does not exist." });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete reply" });
    }
  });

  // Like/unlike a post
  app.post("/api/community/posts/:id/like", requireAuth, async (req: Request, res: Response) => {
    try {
      const post_id = parseInt(req.params.id);
      const user_id = req.user.id;
      const result = await storage.togglePostLike(user_id, post_id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to like/unlike post" });
    }
  });

  // --- LEADERBOARD ---
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const sort = req.query.sort as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const users = await storage.getTopUsers(sort, limit);
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users." });
    }
  });

  // --- NOTES ROUTES ---
  app.get("/api/notes", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const notes = await storage.getNotes(userId);
      res.json(notes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notes." });
    }
  });

  app.post("/api/notes", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const noteData = { ...req.body, user_id: userId };
      const note = await storage.createNote(noteData);
      res.status(201).json(note);
    } catch (error) {
      res.status(500).json({ error: "Failed to create note." });
    }
  });

  app.put("/api/notes/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const noteId = parseInt(req.params.id);
      const updates = req.body;
      const updatedNote = await storage.updateNote(noteId, userId, updates);
      res.json(updatedNote);
    } catch (error) {
      res.status(500).json({ error: "Failed to update note." });
    }
  });

  // Add this route for deleting a note
  app.delete("/api/notes/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const noteId = parseInt(req.params.id);
      const deleted = await storage.deleteNote(noteId, userId);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Note not found or not owned by user." });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete note." });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
