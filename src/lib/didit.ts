export const DIDIT_KYC_WORKFLOW_ID = 'ddbab46a-d544-4907-9cfe-997a18245e6a'

export type DiditSessionStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Awaiting User'
  | 'In Review'
  | 'Approved'
  | 'Declined'
  | 'Resubmitted'
  | 'Abandoned'
  | 'Expired'
  | 'Kyc Expired'
