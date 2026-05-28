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

describe("cart and order flow", () => {
  it("adds products to a persisted cart and updates quantities", async () => {
    const user = userEvent.setup();
    mockCatalogFetch();

    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /add to cart/i }))[0]);
    await user.click(screen.getByRole("link", { name: /cart/i }));
    expect(screen.getByRole("heading", { name: /cart/i })).toBeInTheDocument();
    expect(screen.getByText(/trail backpack/i)).toBeInTheDocument();
    expect(screen.getAllByText("$89.99").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /increase trail backpack/i }));
    expect(screen.getAllByText("$179.98").length).toBeGreaterThan(0);

    cleanup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: /cart/i }));

    expect(screen.getByText(/trail backpack/i)).toBeInTheDocument();
    expect(screen.getAllByText("$179.98").length).toBeGreaterThan(0);
  });

  it("shows login to checkout for guests and routes them to login", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "cartItems",
      JSON.stringify([{ product: products[0], quantity: 1 }]),
    );
    mockCatalogFetch();

    render(<App />);
    await user.click(screen.getByRole("link", { name: /cart/i }));
    await user.click(screen.getByRole("link", { name: /login to checkout/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
    });
  });

  it("places an order with the token, clears the cart, and shows success", async () => {
    const user = userEvent.setup();
    localStorage.setItem("authToken", "signed.jwt.token");
    localStorage.setItem(
      "cartItems",
      JSON.stringify([
        { product: products[0], quantity: 2 },
        { product: products[1], quantity: 1 },
      ]),
    );
    mockFetch(async (url, options) => {
      if (url === "/auth/me") {
        return { status: 200, body: { id: 1, name: "Ada Lovelace", email: "ada@example.com" } };
      }
      if (url === "/orders") {
        expect(options.method).toBe("POST");
        expect(options.headers.Authorization).toBe("Bearer signed.jwt.token");
        expect(JSON.parse(options.body)).toEqual({
          items: [
            { product_id: 1, quantity: 2 },
            { product_id: 2, quantity: 1 },
          ],
        });
        return { status: 201, body: { id: 10 } };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);
    await screen.findByText(/ada lovelace/i);
    await user.click(screen.getByRole("link", { name: /cart/i }));
    await user.click(screen.getByRole("button", { name: /place order/i }));

    expect(await screen.findByRole("heading", { name: /order placed/i })).toBeInTheDocument();
    expect(localStorage.getItem("cartItems")).toBe("[]");
    expect(screen.getByRole("link", { name: /view your orders/i })).toHaveAttribute("href", "/orders");
  });

  it("lists past orders for a logged-in user", async () => {
    localStorage.setItem("authToken", "signed.jwt.token");
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
              id: 10,
              status: "pending",
              total_price: "199.48",
              created_at: "2026-05-28T08:00:00Z",
              items: [],
            },
          ],
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    window.history.pushState({}, "", "/orders");
    render(<App />);

    expect(await screen.findByText(/order #10/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(screen.getByText("$199.48")).toBeInTheDocument();
  });
});
