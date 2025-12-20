/**
 * Ama Tool Definitions
 * Tool schemas for LLM function calling
 */

export const AMA_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_user_wallets',
      description: 'Get ALL of the user\'s wallet balances (ZAR, BTC, ETH, USDT, etc.). Returns an array of all wallets with displayCurrency, fiatBalance, usdtBalance, apy (if present), and updatedAt. Use this when asked about wallets, balances, BTC, ETH, APY, "list wallets", "wallet APYs", or "updated time". IMPORTANT: Return ALL wallets the user asks about, not just ZAR.',
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
      description: 'Get the user\'s profile information (handle, email, name, verification status). Use this when asked about email, handle, profile, or account details.',
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
      description: 'List recent payments for the user. Use this when asked about payments list, last payment, payment status, or "list my payments". Returns payment details: ref, status, amountZAR, currency, createdAt.',
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
      name: 'admin_get_user_by_uid',
      description: '[ADMIN ONLY] Get user information by UID. Returns profile, wallets, and last 20 payments summary. Only use if you are in admin mode.',
      parameters: {
        type: 'object',
        properties: {
          uid: {
            type: 'string',
            description: 'User UID',
          },
        },
        required: ['uid'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'admin_get_doc_by_path',
      description: '[ADMIN ONLY] Get a specific Firestore document by explicit path. Max 50KB response. Only use if you are in admin mode and need to inspect a specific document.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Explicit document path (e.g., "users/abc123" or "payments/xyz789")',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'admin_query_collection',
      description: '[ADMIN ONLY] Query a Firestore collection with filters. Requires limit (max 50). Only use if you are in admin mode.',
      parameters: {
        type: 'object',
        properties: {
          collectionPath: {
            type: 'string',
            description: 'Collection path (e.g., "payments", "users")',
          },
          where: {
            type: 'array',
            description: 'Array of where conditions: [{ field, operator, value }]',
            items: {
              type: 'object',
            },
          },
          orderBy: {
            type: 'object',
            description: 'Order by: { field, direction: "asc" | "desc" }',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of documents to return (required, max: 50)',
          },
        },
        required: ['collectionPath', 'limit'],
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

