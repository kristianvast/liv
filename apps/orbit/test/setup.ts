import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// Tests start on a computer where the tour of Home has been seen; the tour's own test clears it.
beforeEach(() => window.localStorage.setItem("orbit.tour", "seen"));
