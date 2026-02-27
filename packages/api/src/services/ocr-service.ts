export interface OcrResult {
  confidence: number;
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  lines: {
    description: string;
    quantity?: number;
    unitPrice?: number;
    lineTotal?: number;
    vatRate?: number;
  }[];
  totalAmount?: number;
  vatAmount?: number;
}

export interface OcrProvider {
  extract(filePath: string): Promise<OcrResult>;
}

/**
 * Local OCR provider using Tesseract.
 * Stub implementation -- in production, integrate tesseract.js.
 */
export class TesseractProvider implements OcrProvider {
  async extract(_filePath: string): Promise<OcrResult> {
    // Stub: returns empty result with zero confidence.
    // In production: use tesseract.js to extract text, then parse
    // invoice fields with regex/heuristics.
    return {
      confidence: 0,
      lines: [],
      totalAmount: 0,
      vatAmount: 0,
    };
  }
}

/**
 * Cloud OCR provider -- adapter pattern ready for
 * Google Document AI or AWS Textract.
 */
export class CloudOcrProvider implements OcrProvider {
  async extract(_filePath: string): Promise<OcrResult> {
    // Stub: adapter pattern ready for cloud integration.
    // In production:
    //   - Google Document AI: call documentai.projects.locations.processors.process
    //   - AWS Textract: call textract.analyzeExpense
    return {
      confidence: 0,
      lines: [],
    };
  }
}

/**
 * OCR orchestrator: tries local first, falls back to cloud
 * if confidence is below threshold and cloud credentials exist.
 */
export class OcrService {
  private tesseract = new TesseractProvider();
  private cloud = new CloudOcrProvider();
  private threshold: number;

  constructor(threshold?: number) {
    this.threshold =
      threshold || parseInt(process.env.OCR_CONFIDENCE_THRESHOLD || '85', 10);
  }

  async extract(
    filePath: string,
  ): Promise<OcrResult & { provider: string }> {
    // 1. Try local (Tesseract) first
    const local = await this.tesseract.extract(filePath);

    if (local.confidence >= this.threshold) {
      return { ...local, provider: 'tesseract' };
    }

    // 2. Fall back to cloud if API key is configured
    if (process.env.OCR_API_KEY) {
      const cloud = await this.cloud.extract(filePath);
      return cloud.confidence > local.confidence
        ? { ...cloud, provider: process.env.OCR_PROVIDER || 'cloud' }
        : { ...local, provider: 'tesseract' };
    }

    // 3. Return local result even if below threshold
    return { ...local, provider: 'tesseract' };
  }
}
