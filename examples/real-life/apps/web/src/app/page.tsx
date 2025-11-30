"use client";

import { useState, useEffect } from "react";
import { authApi, logicApi } from "@/lib/api";
import type { z } from "zod";
import type { TaskSchema } from "@real-life/backend-logic-sdk";

type Task = z.infer<typeof TaskSchema>;

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignup, setIsSignup] = useState(false);

  // Task form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");

  // Load token from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("auth_token");
    if (saved) setToken(saved);
  }, []);

  // Fetch user and tasks when token changes
  useEffect(() => {
    if (!token) {
      setUser(null);
      setTasks([]);
      return;
    }

    authApi.me(token)
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("auth_token");
        setToken(null);
      });

    logicApi.listTasks(token).then(setTasks).catch(console.error);
  }, [token]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = isSignup
        ? await authApi.signup({ email, password, name })
        : await authApi.login({ email, password });

      localStorage.setItem("auth_token", result.session.token);
      setToken(result.session.token);
      setEmail("");
      setPassword("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!token) return;
    await authApi.logout(token);
    localStorage.removeItem("auth_token");
    setToken(null);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !taskTitle) return;

    setLoading(true);
    try {
      const task = await logicApi.createTask(token, {
        title: taskTitle,
        description: taskDescription || undefined,
      });
      setTasks([...tasks, task]);
      setTaskTitle("");
      setTaskDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async (task: Task) => {
    if (!token) return;

    const newStatus = task.status === "completed" ? "pending" : "completed";
    try {
      const updated = await logicApi.updateTask(token, task.id, { status: newStatus });
      setTasks(tasks.map((t) => (t.id === task.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;

    try {
      await logicApi.deleteTask(token, id);
      setTasks(tasks.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task");
    }
  };

  return (
    <main style={{ maxWidth: 600, margin: "0 auto" }}>
      <h1>Real Life Example</h1>
      <p style={{ color: "#666" }}>Alt-stack: Hono + WarpStream + NextJS + ky</p>

      {error && (
        <div style={{ background: "#fee", padding: "1rem", marginBottom: "1rem", borderRadius: 4 }}>
          {error}
        </div>
      )}

      {!user ? (
        <div style={{ background: "#f5f5f5", padding: "1.5rem", borderRadius: 8 }}>
          <h2>{isSignup ? "Sign Up" : "Login"}</h2>
          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {isSignup && (
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ padding: "0.5rem" }}
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: "0.5rem" }}
            />
            <input
              type="password"
              placeholder="Password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: "0.5rem" }}
            />
            <button type="submit" disabled={loading} style={{ padding: "0.5rem" }}>
              {loading ? "Loading..." : isSignup ? "Sign Up" : "Login"}
            </button>
          </form>
          <button
            onClick={() => setIsSignup(!isSignup)}
            style={{ marginTop: "1rem", background: "none", border: "none", color: "#0070f3", cursor: "pointer" }}
          >
            {isSignup ? "Already have an account? Login" : "Need an account? Sign Up"}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <span>Welcome, {user.name}!</span>
            <button onClick={handleLogout}>Logout</button>
          </div>

          <div style={{ background: "#f5f5f5", padding: "1rem", borderRadius: 8, marginBottom: "1rem" }}>
            <h3 style={{ margin: "0 0 0.5rem" }}>New Task</h3>
            <form onSubmit={handleCreateTask} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <input
                type="text"
                placeholder="Task title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                style={{ padding: "0.5rem" }}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                style={{ padding: "0.5rem" }}
              />
              <button type="submit" disabled={loading || !taskTitle}>
                {loading ? "Creating..." : "Create Task"}
              </button>
            </form>
          </div>

          <h3>Tasks</h3>
          {tasks.length === 0 ? (
            <p style={{ color: "#666" }}>No tasks yet. Create one above!</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {tasks.map((task) => (
                <li
                  key={task.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem",
                    background: "#f9f9f9",
                    marginBottom: "0.5rem",
                    borderRadius: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={task.status === "completed"}
                    onChange={() => handleToggleComplete(task)}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ textDecoration: task.status === "completed" ? "line-through" : "none" }}>
                      {task.title}
                    </div>
                    {task.description && <small style={{ color: "#666" }}>{task.description}</small>}
                  </div>
                  <button onClick={() => handleDelete(task.id)} style={{ color: "red" }}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}

