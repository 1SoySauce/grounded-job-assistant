export interface GroundedAnswerRequest {
  question: string;
  relevantVerifiedFacts: ReadonlyArray<{
    sourcePath: string;
    value: string;
  }>;
  relevantJobContext: string;
  maximumLength: number;
}

export interface GroundedAnswerResult {
  answer: string | null;
  confidence: number;
  sourcePaths: string[];
  needsUserInput: boolean;
}

export interface AIProvider {
  generateGroundedAnswer(
    request: GroundedAnswerRequest,
  ): Promise<GroundedAnswerResult>;
}
