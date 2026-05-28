import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import App from "../App.jsx";

const products = [
  {
    id: 1,
    name: "Trail Backpack",
    description: "Durable day pack",
    price: "89.99",
    stock: 12,
    image_url: "https://example.com/backpack.jpg",
  },
  {
    id: 2,
    name: "Camp Mug",
    description: "Insulated mug",
    price: "19.50",
    stock: 5,
    image_url: "https://example.com/mug.jpg",
  },
];

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
});

function mockFetch(handler) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    const response = await handler(String(url), options);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    };
  });
}

function mockCatalogFetch() {
  mockFetch(async (url) => {
    if (url === "/products") {
      return { status: 200, body: products };
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
}

describe("cart and orders", () => {
  it("adds products to a persistent cart and shows guest checkout login", async () => {
    const user = userEvent.setup();
    mockCatalogFetch();

    const { unmount } = render(<App />);
    await user.click(await screen.findByRole("button", { name: /add trail backpack to cart/i }));
    await user.click(screen.getByRole("link", { name: /cart/i }));

    expect(await screen.findByRole("heading", { name: /cart/i })).toBeInTheDocument();
    expect(screen.getByText(/trail backpack/i)).toBeInTheDocument();
    expect(screen.getByText("$89.99")).toBeInTheDocument();
    expect(screen.getByText(/total/i)).toHaveTextContent("$89.99");
    expect(screen.getByRole("link", { name: /login to checkout/i })).toHaveAttribute("href", "/login");

    unmount();
    window.history.pushState({}, "", "/cart");
    render(<App />);

    expect(await screen.findByText(/trail backpack/i)).toBeInTheDocument();
    expect(screen.getByText(/total/i)).toHaveTextContent("$89.99");
  });

  it("places an order with the auth token, clears the cart, and shows order success", async () => {
    const user = userEvent.setup();
    localStorage.setItem("authToken", "signed.jwt.token");
    mockFetch(async (url, options) => {
      if (url === "/auth/me") {
        return { status: 200, body: { id: 1, name: "Ada Lovelace", email: "ada@example.com" } };
      }
      if (url === "/products") {
        return { status: 200, body: products };
      }
      if (url === "/orders") {
        expect(options.method).toBe("POST");
        expect(options.headers.Authorization).toBe("Bearer signed.jwt.token");
        expect(JSON.parse(options.body)).toEqual({ items: [{ product_id: 1, quantity: 2 }] });
        return {
          status: 201,
          body: { id: 42, status: "pending", total_price: "179.98", items: [] },
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /add trail backpack to cart/i }));
    await user.click(screen.getByRole("button", { name: /add trail backpack to cart/i }));
    await user.click(screen.getByRole("link", { name: /cart/i }));
    await user.click(await screen.findByRole("button", { name: /place order/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/order-success");
    });
    expect(screen.getByRole("heading", { name: /order placed/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view your orders/i })).toHaveAttribute("href", "/orders");
    expect(localStorage.getItem("cartItems")).toBe("[]");
  });

  it("lists past orders for the logged in user", async () => {
    localStorage.setItem("authToken", "signed.jwt.token");
    window.history.pushState({}, "", "/orders");
    mockFetch(async (url, options) => {
      if (url === "/auth/me") {
        return { status: 200, body: { id: 1, name: "Ada Lovelace", email: "ada@example.com" } };
      }
      if (url === "/orders") {
        expect(options.headers.Authorization).toBe("Bearer signed.jwt.token");
        return {
          status: 200,
          body: [
            {
              id: 42,
              status: "pending",
              total_price: "179.98",
              created_at: "2026-05-28T12:00:00Z",
            },
          ],
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: /orders/i })).toBeInTheDocument();
    expect(screen.getByText(/order #42/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(screen.getByText("$179.98")).toBeInTheDocument();
  });
});
