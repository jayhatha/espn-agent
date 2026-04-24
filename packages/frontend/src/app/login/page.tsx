"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorAlert } from "@/components/ui/ErrorAlert";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, loginWithGoogle, loginWithGitHub } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12">
      <Container size="narrow">
        <Card>
          <CardContent className="p-8 space-y-6">
            <div className="text-center">
              <Heading level={2} className="mb-1">Sign In</Heading>
              <Text color="secondary">ESPN Fantasy Baseball Assistant</Text>
            </div>

            {error && (
              <ErrorAlert message={error} variant="error" />
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-body-sm font-medium text-content dark:text-shell-text mb-1"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-body-sm font-medium text-content dark:text-shell-text mb-1"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
              >
                Sign In
              </Button>
            </form>

            <div className="space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-200 dark:border-shell-border" />
                </div>
                <div className="relative flex justify-center text-body-sm">
                  <span className="px-2 bg-white dark:bg-shell-panel text-content-secondary dark:text-shell-muted">
                    Or continue with
                  </span>
                </div>
              </div>

              <button
                onClick={loginWithGoogle}
                className="w-full bg-white dark:bg-shell-bg border border-neutral-300 dark:border-shell-border text-content dark:text-shell-text py-2.5 px-4 rounded-lg hover:bg-surface-secondary dark:hover:bg-shell-panel flex items-center justify-center gap-2 transition-colors text-body-sm font-medium"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M5.27 9.76A7.5 7.5 0 0 1 12 4.5c1.98 0 3.73.72 5.11 1.89l3.81-3.81A11.95 11.95 0 0 0 12 0C7.31 0 3.25 2.61 1.27 6.38l3.99 3.38z"
                  />
                  <path
                    fill="#34A853"
                    d="M16.04 18.01A7.5 7.5 0 0 1 5.27 14.24l-3.99 3.38A11.95 11.95 0 0 0 12 24c3.24 0 6.14-1.3 8.27-3.39l-4.23-3.6z"
                  />
                  <path
                    fill="#4A90E2"
                    d="M12 24c3.24 0 6.06-1.05 8.09-2.85l-4.05-3.34c-.98.66-2.23 1.05-4.04 1.05a7.5 7.5 0 0 1-7.05-4.86l-3.99 3.38C3.25 21.39 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.52 5.52 0 0 1-2.43 3.63l4.05 3.34c2.36-2.18 3.4-5.4 3.4-9.21z"
                  />
                </svg>
                Sign in with Google
              </button>

              <button
                onClick={loginWithGitHub}
                className="w-full bg-accent text-content-inverse py-2.5 px-4 rounded-lg hover:bg-accent-hover dark:bg-shell-border dark:text-shell-text dark:hover:bg-shell-panel flex items-center justify-center gap-2 transition-colors text-body-sm font-medium"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Sign in with GitHub
              </button>
            </div>

            <Text size="sm" color="secondary" className="text-center">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-accent dark:text-shell-accent hover:underline font-medium"
              >
                Sign up
              </Link>
            </Text>
          </CardContent>
        </Card>
      </Container>
    </div>
  );
}
