import { describe, it, expect } from "vitest";
import { SignupSchema, LoginSchema, parseIntParam } from "../../utils/validation.js";

/**
 * Auth Validation Tests
 *
 * Tests request validation fixes from Plan 13-02 (DEBT-03)
 */

describe("Auth validation (DEBT-03)", () => {
  describe("SignupSchema", () => {
    it("should validate correct signup data", () => {
      const valid = {
        email: "test@example.com",
        password: "password123",
        displayName: "Test User"
      };

      const result = SignupSchema.safeParse(valid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("test@example.com");
        expect(result.data.password).toBe("password123");
        expect(result.data.displayName).toBe("Test User");
      }
    });

    it("should validate signup without optional displayName", () => {
      const valid = {
        email: "user@test.com",
        password: "securepass123"
      };

      const result = SignupSchema.safeParse(valid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayName).toBeUndefined();
      }
    });

    it("should reject invalid email format", () => {
      const invalid = {
        email: "not-an-email",
        password: "password123"
      };

      const result = SignupSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain("email");
        expect(result.error.errors[0].message).toContain("Invalid email");
      }
    });

    it("should reject email without @ symbol", () => {
      const invalid = {
        email: "invalidemail.com",
        password: "password123"
      };

      const result = SignupSchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it("should reject short password (less than 8 chars)", () => {
      const invalid = {
        email: "test@example.com",
        password: "short"
      };

      const result = SignupSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain("password");
        expect(result.error.errors[0].message).toContain("at least 8");
      }
    });

    it("should handle missing password field", () => {
      const invalid = {
        email: "test@example.com"
      };

      const result = SignupSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes("password"))).toBe(true);
      }
    });

    it("should handle missing email field", () => {
      const invalid = {
        password: "password123"
      };

      const result = SignupSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes("email"))).toBe(true);
      }
    });

    it("should reject displayName that is too short", () => {
      const invalid = {
        email: "test@example.com",
        password: "password123",
        displayName: "ab"  // Less than 3 chars
      };

      const result = SignupSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain("displayName");
      }
    });

    it("should reject displayName that is too long", () => {
      const invalid = {
        email: "test@example.com",
        password: "password123",
        displayName: "a".repeat(51)  // More than 50 chars
      };

      const result = SignupSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain("displayName");
      }
    });
  });

  describe("LoginSchema", () => {
    it("should validate correct login data", () => {
      const valid = {
        email: "test@example.com",
        password: "anypassword"
      };

      const result = LoginSchema.safeParse(valid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("test@example.com");
        expect(result.data.password).toBe("anypassword");
      }
    });

    it("should reject invalid email format", () => {
      const invalid = {
        email: "bad-email",
        password: "password"
      };

      const result = LoginSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain("email");
      }
    });

    it("should reject empty password", () => {
      const invalid = {
        email: "test@example.com",
        password: ""
      };

      const result = LoginSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain("password");
        expect(result.error.errors[0].message).toContain("required");
      }
    });

    it("should handle missing email field", () => {
      const invalid = {
        password: "password123"
      };

      const result = LoginSchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it("should handle missing password field", () => {
      const invalid = {
        email: "test@example.com"
      };

      const result = LoginSchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });
  });

  describe("parseIntParam", () => {
    it("should parse valid integer string", () => {
      const result = parseIntParam("123", "leagueId");

      expect(result).toBe(123);
    });

    it("should parse valid negative integer", () => {
      const result = parseIntParam("-456", "teamId");

      expect(result).toBe(-456);
    });

    it("should parse zero", () => {
      const result = parseIntParam("0", "playerId");

      expect(result).toBe(0);
    });

    it("should throw on non-numeric string", () => {
      expect(() => parseIntParam("abc", "leagueId")).toThrow("Invalid leagueId");
    });

    it("should throw on empty string", () => {
      expect(() => parseIntParam("", "teamId")).toThrow("Invalid teamId");
    });

    it("should truncate decimal number (parseInt behavior)", () => {
      // Note: parseInt truncates decimals, doesn't throw
      const result = parseIntParam("12.5", "playerId");
      expect(result).toBe(12);
    });

    it("should throw on NaN result", () => {
      expect(() => parseIntParam("not-a-number", "param")).toThrow("Invalid param");
    });

    it("should include parameter name in error message", () => {
      try {
        parseIntParam("invalid", "customParam");
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).toContain("customParam");
      }
    });
  });
});
