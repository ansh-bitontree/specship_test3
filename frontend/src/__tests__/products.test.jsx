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
    stock: 0,
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

function mockFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url) === "/products") {
      return {
        ok: true,
        status: 200,
        json: async () => products,
      };
    }
    if (String(url) === "/products/1") {
      return {
        ok: true,
        status: 200,
        json: async () => products[0],
      };
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
}

describe("product catalog", () => {
  it("shows products from the API and filters them by name", async () => {
    const user = userEvent.setup();
    mockFetch();

    render(<App />);

    expect(screen.getByRole("status", { name: /loading products/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /trail backpack/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /camp mug/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /add to cart/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /out of stock/i })).toBeDisabled();

    await user.type(screen.getByRole("searchbox", { name: /search products/i }), "pack");

    expect(screen.getByRole("heading", { name: /trail backpack/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /camp mug/i })).not.toBeInTheDocument();
  });

  it("navigates from a product card to the product detail page", async () => {
    const user = userEvent.setup();
    mockFetch();

    render(<App />);

    await user.click(await screen.findByRole("link", { name: /trail backpack/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/products/1");
    });
    expect(await screen.findByRole("heading", { name: /trail backpack/i })).toBeInTheDocument();
    expect(screen.getByText(/durable day pack/i)).toBeInTheDocument();
    expect(screen.getByText(/12 in stock/i)).toBeInTheDocument();
  });

  it("shows a clear error when products fail to load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Server error" }),
    });

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load products");
  });

  it("disables add to cart for an out-of-stock product detail", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url) === "/products") {
        return { ok: true, status: 200, json: async () => products };
      }
      if (String(url) === "/products/2") {
        return { ok: true, status: 200, json: async () => products[1] };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    await user.click(await screen.findByRole("link", { name: /camp mug/i }));

    expect(await screen.findByRole("heading", { name: /camp mug/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /out of stock/i })).toBeDisabled();
  });
});
