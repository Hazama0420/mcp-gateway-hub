// components/CreateEndpointModal.tsx
'use client';

import * as React from 'react';
import { CreateEndpointWizard } from '@/components/endpoints/create-endpoint-wizard';

export interface CreateEndpointModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onOpenPlayground?: (endpointId: string) => void;
  onOpenClientConfig?: (endpoint: any) => void;
  onOpenOAuthModal?: (endpoint: any) => void;
}

export function CreateEndpointModal(props: CreateEndpointModalProps) {
  return <CreateEndpointWizard {...props} />;
}