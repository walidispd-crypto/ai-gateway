import { DEFAULT_MODEL_ID, MODELS, type PublicModel } from "@/config/models";
import { DEFAULT_PRESET } from "@/config/prompts";
import { ChatApp } from "@/components/chat/ChatApp";

export default function HomePage() {
  // Only display metadata crosses to the client; Worker URLs and tokens stay on the server.
  const models: PublicModel[] = MODELS.map(({ id, label, description, tags, maxContextChars }) => ({
    id,
    label,
    description,
    tags,
    maxContextChars,
  }));

  return (
    <ChatApp
      models={models}
      defaultModelId={DEFAULT_MODEL_ID}
      defaultSystem={DEFAULT_PRESET.prompt}
    />
  );
}
