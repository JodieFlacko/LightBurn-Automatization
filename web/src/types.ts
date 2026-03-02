/**
 * Core type definitions for the Victoria Laser App
 */

export type Order = {
  id: number;
  orderId: string;
  orderItemId: string | null;
  purchaseDate: string | null;
  sku: string | null;
  buyerName: string | null;
  customField: string | null;
  status: 'pending' | 'processing' | 'printed' | 'error';
  quantity: number;
  detectedColor?: string | null;
  errorMessage?: string | null;
  processedAt?: string | null;
  attemptCount?: number;
  // Amazon Custom fields
  zipUrl: string | null;
  designName: string | null;
  fontFamily: string | null;
  colorName: string | null;
  frontText: string | null;
  backText1: string | null;
  backText2: string | null;
  backText3: string | null;
  backText4: string | null;
  customDataSynced: number | null;
  customDataError: string | null;
  // Front side fields
  fronteStatus: 'pending' | 'processing' | 'printed' | 'error';
  fronteErrorMessage?: string | null;
  fronteAttemptCount?: number;
  fronteProcessedAt?: string | null;
  frontePrintCount: number;
  // Retro side fields
  retroStatus: 'not_required' | 'pending' | 'processing' | 'printed' | 'error';
  retroErrorMessage?: string | null;
  retroAttemptCount?: number;
  retroProcessedAt?: string | null;
  retroPrintCount: number;
};
