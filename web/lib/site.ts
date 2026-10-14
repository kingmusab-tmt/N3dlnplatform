// Who is behind TMTechEasy Gate, and how to reach them. One place, used by the
// footer, the privacy notice and the credits page.

export const ORG = {
  name: 'Triple Multipurpose Technology',
  website: 'https://triplemultipurposetechnology.com.ng',
  websiteLabel: 'triplemultipurposetechnology.com.ng',
  ceo: 'Engr. Musab Mubaraq Mburaimoh',
} as const;

export const CONTACT = {
  emails: ['musab.buraimoh@gmail.com', 'support@triplemultipurposetechnology.com.ng'],
  /** Support address, used for privacy and data requests. */
  support: 'support@triplemultipurposetechnology.com.ng',
  phones: [
    { e164: '+2348162552901', display: '+234 816 255 2901' },
    { e164: '+2349049376773', display: '+234 904 937 6773' },
  ],
} as const;
