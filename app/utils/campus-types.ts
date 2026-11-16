export type SourceChunk = {
  id: string;
  documentId: string;
  name: string;
  text: string;
  page?: number;
  paragraph?: number;
  label: string;
  score?: number;
};
export type WebSource = { title: string; url: string };
export type ImageRevision = {
  before: string;
  after: string;
  model: string;
  prompt: string;
};
export type ArtifactKind = "html" | "svg" | "mermaid" | "echarts";
export type Artifact = { kind: ArtifactKind; code: string; title: string };
