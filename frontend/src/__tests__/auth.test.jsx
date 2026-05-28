import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import App from "../App.jsx";

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

describe("authentication flow", () => {
  it("registers a user from the register page", async () => {
    const user = userEvent.setup();
    mockFetch(async (url, options) => {
      expect(url).toBe("/auth/register");
      expect(JSON.parse(options.body)).toEqual({
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "secret123",
      });
      return {
        status: 201,
        body: { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
      };
    });

    render(<App />);
    await user.click(screen.getByRole("link", { name: /register/i }));
    await user.type(screen.getByLabelText(/name/i), "Ada Lovelace");
    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/account created/i)).toBeInTheDocument();
  });

  it("logs in, persists the token, fetches the user, and logs out", async () => {
    const user = userEvent.setup();
    mockFetch(async (url, options) => {
      if (url === "/auth/login") {
        return {
          status: 200,
          body: { access_token: "signed.jwt.token", token_type: "bearer" },
        };
      }
      if (url === "/auth/me") {
        expect(options.headers.Authorization).toBe("Bearer signed.jwt.token");
        return {
          status: 200,
          body: { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);
    await user.click(screen.getByRole("link", { name: /login/i }));
    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /login/i }));

    expect(await screen.findByText(/ada lovelace/i)).toBeInTheDocument();
    expect(localStorage.getItem("authToken")).toBe("signed.jwt.token");

    await user.click(screen.getByRole("button", { name: /logout/i }));

    expect(localStorage.getItem("authToken")).toBeNull();
    expect(screen.getByRole("link", { name: /login/i })).toBeInTheDocument();
  });

  it("restores logged-in state from localStorage on refresh", async () => {
    localStorage.setItem("authToken", "stored.jwt.token");
    mockFetch(async (url, options) => {
      expect(url).toBe("/auth/me");
      expect(options.headers.Authorization).toBe("Bearer stored.jwt.token");
      return {
        status: 200,
        body: { id: 2, name: "Grace Hopper", email: "grace@example.com" },
      };
    });

    render(<App />);

    expect(await screen.findByText(/grace hopper/i)).toBeInTheDocument();
  });

  it("redirects unauthenticated users away from protected routes", async () => {
    window.history.pushState({}, "", "/cart");
    mockFetch(async () => {
      throw new Error("Unauthenticated protected route should not fetch the user");
    });

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
    });
    expect(screen.getByRole("heading", { name: /login/i })).toBeInTheDocument();
  });
});
