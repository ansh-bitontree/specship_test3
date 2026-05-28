import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, BrowserRouter as Router, Routes, useNavigate } from "react-router-dom";


const AuthContext = createContext(null);
const TOKEN_KEY = "authToken";


function useAuth() {
  return useContext(AuthContext);
}


async function fetchCurrentUser(token) {
  const response = await fetch("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Unable to load profile");
  }
  return response.json();
}


function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const currentUser = await fetchCurrentUser(token);
        if (!ignore) {
          setUser(currentUser);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        if (!ignore) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadUser();
    return () => {
      ignore = true;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      async login(email, password) {
        const response = await fetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          throw new Error("Invalid email or password");
        }
        const payload = await response.json();
        localStorage.setItem(TOKEN_KEY, payload.access_token);
        setToken(payload.access_token);
      },
      logout() {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      },
    }),
    [loading, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <Link to="/">Home</Link>
      <Link to="/cart">Cart</Link>
      <Link to="/orders">Orders</Link>
      {user ? (
        <div className="session">
          <span>{user.name}</span>
          <button type="button" onClick={logout}>
            Logout
          </button>
        </div>
      ) : (
        <div className="session">
          <Link to="/login">Login</Link>
          <Link to="/register">Register</Link>
        </div>
      )}
    </nav>
  );
}


function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (response.ok) {
      setMessage("Account created");
    } else {
      setMessage("Registration failed");
    }
  }

  return (
    <main className="page">
      <h1>Register</h1>
      <form onSubmit={submit} className="form">
        <label>
          Name
          <input name="name" value={form.name} onChange={updateField} required />
        </label>
        <label>
          Email
          <input name="email" type="email" value={form.email} onChange={updateField} required />
        </label>
        <label>
          Password
          <input name="password" type="password" value={form.password} onChange={updateField} required />
        </label>
        <button type="submit">Create Account</button>
      </form>
      {message && <p>{message}</p>}
    </main>
  );
}


function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await login(form.email, form.password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="page">
      <h1>Login</h1>
      <form onSubmit={submit} className="form">
        <label>
          Email
          <input name="email" type="email" value={form.email} onChange={updateField} required />
        </label>
        <label>
          Password
          <input name="password" type="password" value={form.password} onChange={updateField} required />
        </label>
        <button type="submit">Login</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}


function ProtectedRoute({ children }) {
  const { token, user, loading } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (loading) {
    return <main className="page">Loading...</main>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}


function HomePage() {
  return (
    <main className="page">
      <h1>Home</h1>
    </main>
  );
}


function CartPage() {
  return (
    <main className="page">
      <h1>Cart</h1>
    </main>
  );
}


function OrdersPage() {
  return (
    <main className="page">
      <h1>Orders</h1>
    </main>
  );
}


function AppRoutes() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/cart"
          element={
            <ProtectedRoute>
              <CartPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute>
              <OrdersPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}


export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
