export type BankerDirectoryEntry = {
  key: 'absa_mz' | 'moza' | 'bim' | 'fnb_mz' | 'vista_mz'
  bank: string
  shortBank: string
  banker: string
  email: string
  salutation: 'Exmo. Sr.' | 'Exma. Sra.'
  language: 'pt-MZ'
  active: boolean
  cc?: string[]
  /** Production-only fact. Never populated from Planned replies. */
  knownLimitZar?: number
}

export const BANKER_DIRECTORY: readonly BankerDirectoryEntry[] = [
  {
    key: 'absa_mz',
    bank: 'Absa Moçambique',
    shortBank: 'Absa',
    banker: 'Ivan Nhaguilunguane',
    email: 'Ivan.nhaguilunguane@absa.africa',
    salutation: 'Exmo. Sr.',
    language: 'pt-MZ',
    active: true,
  },
  {
    key: 'moza',
    bank: 'Moza Banco',
    shortBank: 'Moza',
    banker: 'Anika Abdula',
    email: 'anika.abdula@mozabanco.co.mz',
    salutation: 'Exma. Sra.',
    language: 'pt-MZ',
    active: true,
  },
  {
    key: 'bim',
    bank: 'Millennium bim',
    shortBank: 'BIM',
    banker: 'Lúcia Cumbane',
    email: 'LCUMBANE@millenniumbim.co.mz',
    salutation: 'Exma. Sra.',
    language: 'pt-MZ',
    active: true,
  },
  {
    key: 'fnb_mz',
    bank: 'FNB Moçambique',
    shortBank: 'FNB Moz',
    banker: 'Francisco Chijumane',
    email: 'Francisco.Chijumane@fnb.co.mz',
    salutation: 'Exmo. Sr.',
    language: 'pt-MZ',
    active: true,
  },
  {
    key: 'vista_mz',
    bank: 'Vista Bank Moçambique',
    shortBank: 'Vista',
    banker: 'Hélio Pereira',
    email: 'helio.pereira@vistabankgroup.com',
    salutation: 'Exmo. Sr.',
    language: 'pt-MZ',
    active: true,
  },
] as const
