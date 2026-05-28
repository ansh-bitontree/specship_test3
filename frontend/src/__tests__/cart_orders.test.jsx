import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function mockFetch(handler) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    return handler(String(url), options);
  });
}

describe("cart and orders flow", () => {
  it("keeps cart items after a refresh and prompts guests to log in before checkout", async () => {
    const user = userEvent.setup();
    mockFetch(async (url) => {
      if (url === "/products") {
        return jsonResponse(200, products);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);
    await user.click((await screen.findAllByRole("button", { name: /add to cart/i }))[0]);
    await user.click(screen.getByRole("link", { name: /cart/i }));

    expect(screen.getByRole("heading", { name: /cart/i })).toBeInTheDocument();
    expect(screen.getByText(/trail backpack/i)).toBeInTheDocument();
    expect(screen.getByText("$89.99")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /login to checkout/i })).toHaveAttribute("href", "/login");

    cleanup();
    window.history.pushState({}, "", "/cart");
    render(<App />);

    expect(screen.getByText(/trail backpack/i)).toBeInTheDocument();
    expect(screen.getByText(/total/i)).toHaveTextContent("$89.99");
  });

  it("submits an order with the JWT, clears the cart, and shows order history", async () => {
    const user = userEvent.setup();
    const requests = [];
    localStorage.setItem("authToken", "signed.jwt.token");
    mockFetch(async (url, options = {}) => {
      requests.push({ url, options });
      if (url === "/auth/me") {
        expect(options.headers.Authorization).toBe("Bearer signed.jwt.token");
        return jsonResponse(200, { id: 7, name: "Ada Lovelace", email: "ada@example.com" });
      }
      if (url === "/products") {
        return jsonResponse(200, products);
      }
      if (url === "/orders" && options.method === "POST") {
        expect(options.headers.Authorization).toBe("Bearer signed.jwt.token");
        expect(JSON.parse(options.body)).toEqual({ items: [{ product_id: 1, quantity: 2 }] });
        return jsonResponse(201, {
          id: 12,
          status: "pending",
          total_price: "179.98",
          created_at: "2026-05-28T12:00:00Z",
          items: [
            {
              id: 21,
              product_id: 1,
              product_name: "Trail Backpack",
              quantity: 2,
              unit_price: "89.99",
              subtotal: "179.98",
            },
          ],
        });
      }
      if (url === "/orders" && !options.method) {
        expect(options.headers.Authorization).toBe("Bearer signed.jwt.token");
        return jsonResponse(200, [
          {
            id: 12,
            status: "pending",
            total_price: "179.98",
            created_at: "2026-05-28T12:00:00Z",
            items: [],
          },
        ]);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /add to cart/i }))[0]);
    await user.click(screen.getByRole("link", { name: /cart/i }));
    const cartItem = screen.getByRole("row", { name: /trail backpack/i });
    await user.click(within(cartItem).getByRole("button", { name: /increase quantity/i }));
    await user.click(screen.getByRole("button", { name: /place order/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/order-success");
    });
    expect(screen.getByText(/order placed/i)).toBeInTheDocument();
    expect(localStorage.getItem("cartItems")).toBe("[]");

    await user.click(screen.getByRole("link", { name: /view your orders/i }));

    expect(await screen.findByText(/order #12/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(screen.getByText("$179.98")).toBeInTheDocument();
    expect(requests.some((request) => request.url === "/orders" && request.options.method === "POST")).toBe(true);
  });
});
