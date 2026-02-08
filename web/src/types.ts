/**
 * Core type definitions for the Victoria Laser App
 */

export type Order = {
  id: number;
  orderId: string;
  purchaseDate: string | null;
  sku: string | null;
  buyerName: string | null;
  customField: string | null;
  status: 'pending' | 'processing' | 'printed' | 'error';
  detectedColor?: string | null;
  errorMessage?: string | null;
  processedAt?: string | null;
  attemptCount?: number;
  // Front side fields
  fronteStatus: 'pending' | 'processing' | 'printed' | 'error';
  fronteErrorMessage?: string | null;
  fronteAttemptCount?: number;
  fronteProcessedAt?: string | null;
  // Retro side fields
  retroStatus: 'not_required' | 'pending' | 'processing' | 'printed' | 'error';
  retroErrorMessage?: string | null;
  retroAttemptCount?: number;
  retroProcessedAt?: string | null;
};
