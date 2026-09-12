import { z } from "zod";

export const SceneSchema = z.object({
  order: z.number().int().min(1),
  narration: z.string().describe("Voiceover line for this scene, one short sentence"),
  visualPrompt: z.string().describe("Prompt for generating this scene's image"),
});

export const SceneBreakdownSchema = z.object({
  scenes: z.array(SceneSchema).min(3).max(8),
});

export type Scene = z.infer<typeof SceneSchema>;
export type SceneBreakdown = z.infer<typeof SceneBreakdownSchema>;

export interface LLMProvider {
  /** Generate a short marketing/ad script (~150 words) from a creative brief. */
  generateScript(brief: string): Promise<string>;

  /** Break a script into an ordered list of scenes with narration + visual prompts. */
  generateSceneBreakdown(brief: string, script: string): Promise<SceneBreakdown>;
}
