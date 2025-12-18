/**
 * Type definitions for TronWeb
 */

declare module 'tronweb' {
  interface TronWebOptions {
    fullHost?: string
    headers?: Record<string, string>
    privateKey?: string
  }

  interface Contract {
    transfer(to: string, amount: number): {
      send(): Promise<string>
    }
    balanceOf(address: string): {
      call(): Promise<string | number>
    }
  }

  class TronWeb {
    constructor(options?: TronWebOptions)
    contract(): {
      at(address: string): Promise<Contract>
    }
  }

  export default TronWeb
}

