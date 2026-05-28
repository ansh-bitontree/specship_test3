import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, BrowserRouter as Router, Routes, useNavigate, useParams } from "react-router-dom";


const AuthContext = createContext(null);
const CartContext = createContext(null);
const TOKEN_KEY = "authToken";
const CART_KEY = "cartItems";


function useAuth() {
  return useContext(AuthContext);
}


function useCart() {
  return useContext(CartContext);
}


function readStoredCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}


function CartProvider({ children }) {
  const [items, setItems] = useState(readStoredCart);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      addItem(product) {
        setItems((currentItems) => {
          const existingItem = currentItems.find((item) => item.product.id === product.id);
          if (existingItem) {
            return currentItems.map((item) =>
              item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
            );
          }
          return [...currentItems, { product, quantity: 1 }];
        });
      },
      removeItem(productId) {
        setItems((currentItems) => currentItems.filter((item) => item.product.id !== productId));
      },
      increaseQuantity(productId) {
        setItems((currentItems) =>
          currentItems.map((item) =>
            item.product.id === productId ? { ...item, quantity: item.quantity + 1 } : item,
          ),
        );
      },
      decreaseQuantity(productId) {
        setItems((currentItems) =>
          currentItems
            .map((item) =>
              item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item,
            )
            .filter((item) => item.quantity > 0),
        );
      },
      clearCart() {
        setItems([]);
      },
    }),
    [items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
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
  const { addItem } = useCart();

  return (
    <article className="product-card">
      <img src={product.image_url} alt={product.name} />
      <div className="product-card__body">
        <Link to={`/products/${product.id}`} className="product-card__title">
          <h2>{product.name}</h2>
        </Link>
        <p className="product-price">{formatPrice(product.price)}</p>
        <button type="button" onClick={() => addItem(product)}>
          Add to Cart
        </button>
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
  const { addItem } = useCart();
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
        <button type="button" onClick={() => addItem(product)}>
          Add to Cart
        </button>
      </section>
    </main>
  );
}


function CartPage() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { items, increaseQuantity, decreaseQuantity, removeItem, clearCart } = useCart();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const total = items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);

  async function placeOrder() {
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error("Unable to place order");
      }
      clearCart();
      navigate("/order-success");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="cart-page">
      <h1>Cart</h1>
      {items.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <>
          <div className="cart-items">
            {items.map((item) => {
              const subtotal = Number(item.product.price) * item.quantity;
              return (
                <article className="cart-item" key={item.product.id}>
                  <div>
                    <h2>{item.product.name}</h2>
                    <p>{formatPrice(item.product.price)} each</p>
                  </div>
                  <div className="quantity-controls">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.product.name}`}
                      onClick={() => decreaseQuantity(item.product.id)}
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${item.product.name}`}
                      onClick={() => increaseQuantity(item.product.id)}
                    >
                      +
                    </button>
                  </div>
                  <p>{formatPrice(subtotal)}</p>
                  <button type="button" onClick={() => removeItem(item.product.id)}>
                    Remove
                  </button>
                </article>
              );
            })}
          </div>
          <section className="cart-summary" aria-label="Cart summary">
            <strong>Total</strong>
            <span>{formatPrice(total)}</span>
          </section>
          {user ? (
            <button type="button" onClick={placeOrder} disabled={submitting}>
              {submitting ? "Placing Order..." : "Place Order"}
            </button>
          ) : (
            <Link className="button-link" to="/login">
              Login to Checkout
            </Link>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </main>
  );
}


function OrderSuccessPage() {
  return (
    <main className="page">
      <h1>Order Placed</h1>
      <p>Your order has been placed successfully.</p>
      <Link to="/orders">View your orders</Link>
    </main>
  );
}


function OrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadOrders() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/orders", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error("Unable to load orders");
        }
        const payload = await response.json();
        if (!ignore) {
          setOrders(payload);
        }
      } catch {
        if (!ignore) {
          setError("Unable to load orders");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadOrders();
    return () => {
      ignore = true;
    };
  }, [token]);

  return (
    <main className="orders-page">
      <h1>Orders</h1>
      {loading && <p>Loading orders...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && orders.length === 0 && <p>No orders yet.</p>}
      {!loading && !error && orders.length > 0 && (
        <div className="order-list">
          {orders.map((order) => (
            <article className="order-row" key={order.id}>
              <div>
                <h2>Order #{order.id}</h2>
                <p>{new Date(order.created_at).toLocaleDateString()}</p>
              </div>
              <span>{order.status}</span>
              <strong>{formatPrice(order.total_price)}</strong>
            </article>
          ))}
        </div>
      )}
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
        <Route path="/cart" element={<CartPage />} />
        <Route path="/order-success" element={<OrderSuccessPage />} />
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
        <CartProvider>
          <AppRoutes />
        </CartProvider>
      </AuthProvider>
    </Router>
  );
}
