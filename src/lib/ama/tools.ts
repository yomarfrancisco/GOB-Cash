/**
 * Ama Tool Definitions
 * Tool schemas for LLM function calling
 */

export const AMA_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_user_wallets',
      description: 'Get the user\'s wallet balances (ZAR, crypto, etc.). Use this when asked about balance, funds, or account status.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_user_profile',
      description: 'Get the user\'s profile information (name, handle, verification status). Use this when asked about profile or account details.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_payment_by_ref',
      description: 'Get payment details by payment reference (ref). Use this when asked about a specific payment status or transaction.',
      parameters: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Payment reference (UUID)',
          },
        },
        required: ['ref'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_recent_payments',
      description: 'List recent payments for the user. Use this when asked about payment history or recent transactions.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of payments to return (default: 20, max: 50)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_transactions',
      description: 'Search transactions for the user by status or type. Use this when asked about transaction history or specific transaction types.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Transaction status (e.g., COMPLETED, PENDING, FAILED)',
          },
          type: {
            type: 'string',
            description: 'Transaction type (e.g., BANK_DEPOSIT_TO_USDT_TRON, PAYMENT_TO_USER)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of transactions to return (default: 20, max: 50)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'admin_get_user_by_handle',
      description: '[ADMIN ONLY] Get user information by handle. Only use if you are in admin mode and the request is appropriate.',
      parameters: {
        type: 'object',
        properties: {
          handle: {
            type: 'string',
            description: 'User handle (e.g., @username)',
          },
        },
        required: ['handle'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'admin_search_payments',
      description: '[ADMIN ONLY] Search payments across all users. Only use if you are in admin mode and the request is appropriate.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Payment status filter',
          },
          userId: {
            type: 'string',
            description: 'Filter by user ID',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of payments to return (default: 20, max: 50)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'debug_whoami',
      description: 'Debug tool: Returns current user UID, email, admin status, and project ID. Use for diagnostics only.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
]

