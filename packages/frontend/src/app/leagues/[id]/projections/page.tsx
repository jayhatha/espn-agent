"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, Info, CheckCircle, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function ProjectionsUploadPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const leagueId = params.id as string;
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return api.uploadProjections(file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["league", leagueId] });
      alert("Projections uploaded successfully!");
      setFile(null);
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  return (
    <Container className="py-8">
      <div className="mb-6">
        <Link
          href={`/leagues/${leagueId}`}
          className="text-body-sm font-medium text-content-secondary hover:text-content transition-colors"
        >
          &larr; Back to League
        </Link>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <Heading level={2}>Upload Projections</Heading>
          <p className="text-body-sm text-content-secondary mt-1">
            Upload FanGraphs Depth Charts RoS projections to get standings
            predictions and recommendations.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* File Upload Area */}
            <div
              className={cn(
                "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                dragActive
                  ? "border-accent bg-accent-light"
                  : "border-neutral-300 dark:border-shell-border bg-surface-secondary dark:bg-shell-bg"
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="file-upload"
                accept=".csv"
                onChange={handleFileChange}
                className="sr-only"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="mx-auto h-12 w-12 text-content-tertiary mb-2" />
                <p className="text-body-sm font-medium text-content dark:text-shell-text">
                  {file ? file.name : "Drop CSV file here or click to browse"}
                </p>
                <p className="mt-1 text-xs text-content-secondary">
                  FanGraphs Depth Charts export (.csv)
                </p>
              </label>
            </div>

            {file && (
              <div className="rounded-lg border border-positive-border bg-positive-light p-4">
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-positive mr-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-content truncate">
                      File ready: {file.name}
                    </p>
                    <p className="text-xs text-content-secondary">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="ml-auto text-content-secondary hover:text-content transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {uploadMutation.isError && (
              <div className="rounded-lg border border-negative-border bg-negative-light p-4">
                <Heading level={4} className="text-negative">Upload Failed</Heading>
                <p className="text-negative text-body-sm mt-1">
                  {(uploadMutation.error as Error).message}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Link
                href={`/leagues/${leagueId}`}
                className="text-body-sm font-medium text-content-secondary hover:text-content transition-colors"
              >
                Cancel
              </Link>
              <Button
                type="submit"
                variant="primary"
                disabled={!file || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Uploading...
                  </>
                ) : (
                  "Upload Projections"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-info" />
            <Heading level={3}>How to export FanGraphs projections</Heading>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="text-body-sm text-content-secondary space-y-2 ml-4 list-decimal">
            <li>
              Go to{" "}
              <a
                href="https://www.fangraphs.com/projections.aspx?pos=all&stats=bat&type=fangraphsdc"
                target="_blank"
                rel="noopener noreferrer"
                className="text-info underline hover:text-info-border transition-colors"
              >
                FanGraphs Depth Charts (Hitters)
              </a>
            </li>
            <li>Click "Export Data" and download the CSV file</li>
            <li>
              Repeat for{" "}
              <a
                href="https://www.fangraphs.com/projections.aspx?pos=all&stats=pit&type=fangraphsdc"
                target="_blank"
                rel="noopener noreferrer"
                className="text-info underline hover:text-info-border transition-colors"
              >
                Pitchers
              </a>
            </li>
            <li>
              Upload both files here (you'll need to upload them separately)
            </li>
          </ol>
          <p className="mt-4 text-xs text-content-tertiary">
            Note: You need a FanGraphs subscription to access Depth Charts
            projections.
          </p>
        </CardContent>
      </Card>
    </Container>
  );
}
