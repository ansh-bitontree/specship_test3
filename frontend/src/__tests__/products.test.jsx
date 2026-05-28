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

    expect(await screen.findByRole("heading", { name: /trail backpack/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /camp mug/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /add to cart/i })).toHaveLength(2);

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

  it("shows a friendly product loading error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load products");
  });

  it("disables adding out-of-stock products to the cart", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url) === "/products") {
        return { ok: true, status: 200, json: async () => [{ ...products[0], stock: 0 }] };
      }
      if (String(url) === "/products/1") {
        return { ok: true, status: 200, json: async () => ({ ...products[0], stock: 0 }) };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    const catalogButton = await screen.findByRole("button", { name: /out of stock/i });
    expect(catalogButton).toBeDisabled();

    await userEvent.click(screen.getByRole("link", { name: /trail backpack/i }));

    const detailButton = await screen.findByRole("button", { name: /out of stock/i });
    expect(detailButton).toBeDisabled();
  });

  it("shows a toast when an item is added to the cart", async () => {
    const user = userEvent.setup();
    mockFetch();

    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /add to cart/i }))[0]);

    expect(await screen.findByRole("status")).toHaveTextContent("Item added to cart");
  });
});
