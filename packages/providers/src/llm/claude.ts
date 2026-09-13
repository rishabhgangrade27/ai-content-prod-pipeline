import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { LLMProvider, SceneBreakdown } from "./types.js";
import { SceneBreakdownSchema } from "./types.js";

const MODEL = "claude-haiku-4-5";

export class ClaudeLLMProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    this.client = new Anthropic({ apiKey });
  }

  async generateScript(brief: string, feedback?: string): Promise<string> {
    const userContent = feedback
      ? `Brief: ${brief}\n\nYour previous attempt failed automated QA: ${feedback}\nWrite a new script that fixes this.`
      : brief;

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You write short-form vertical video ad scripts (UGC/product-highlight style). " +
        "Write a single ~150-word voiceover script for the given brief. Punchy, conversational, " +
        "no scene directions, no headings — just the spoken words.",
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock) {
      throw new Error("Claude response contained no text block");
    }
    return textBlock.text.trim();
  }

  async generateSceneBreakdown(brief: string, script: string): Promise<SceneBreakdown> {
    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system:
        "You break a short-form ad script into an ordered list of 3-8 scenes for a " +
        "still-image + motion (Ken Burns) video. Each scene needs a one-sentence narration " +
        "line drawn from the script and a detailed visual prompt suitable for an AI image generator.",
      messages: [
        {
          role: "user",
          content: `Brief: ${brief}\n\nScript:\n${script}`,
        },
      ],
      output_config: {
        format: zodOutputFormat(SceneBreakdownSchema),
      },
    });

    if (!response.parsed_output) {
      throw new Error("Claude did not return a parseable scene breakdown");
    }
    return response.parsed_output;
  }
}
