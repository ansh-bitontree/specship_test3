import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, BrowserRouter as Router, Routes, useNavigate, useParams } from "react-router-dom";


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


function formatPrice(price) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(price));
}


function ProductCard({ product }) {
  return (
    <article className="product-card">
      <img src={product.image_url} alt={product.name} />
      <div className="product-card__body">
        <Link to={`/products/${product.id}`} className="product-card__title">
          <h2>{product.name}</h2>
        </Link>
        <p className="product-price">{formatPrice(product.price)}</p>
        <button type="button">Add to Cart</button>
      </div>
    </article>
  );
}


function HomePage() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadProducts() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/products");
        if (!response.ok) {
          throw new Error("Unable to load products");
        }
        const payload = await response.json();
        if (!ignore) {
          setProducts(payload);
        }
      } catch {
        if (!ignore) {
          setError("Unable to load products");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadProducts();
    return () => {
      ignore = true;
    };
  }, []);

  const visibleProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <main className="catalog-page">
      <div className="catalog-header">
        <h1>Products</h1>
        <label className="search-field">
          <span>Search products</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products"
          />
        </label>
      </div>

      {loading && <p>Loading products...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && (
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </main>
  );
}


function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadProduct() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/products/${id}`);
        if (!response.ok) {
          throw new Error("Unable to load product");
        }
        const payload = await response.json();
        if (!ignore) {
          setProduct(payload);
        }
      } catch {
        if (!ignore) {
          setError("Unable to load product");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadProduct();
    return () => {
      ignore = true;
    };
  }, [id]);

  if (loading) {
    return <main className="page">Loading product...</main>;
  }
  if (error || !product) {
    return (
      <main className="page">
        <p role="alert">{error || "Product not found"}</p>
      </main>
    );
  }

  return (
    <main className="product-detail">
      <img src={product.image_url} alt={product.name} />
      <section className="product-detail__content">
        <h1>{product.name}</h1>
        <p>{product.description}</p>
        <p className="product-price">{formatPrice(product.price)}</p>
        <p>{product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}</p>
        <button type="button">Add to Cart</button>
      </section>
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
        <Route path="/products/:id" element={<ProductDetailPage />} />
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
