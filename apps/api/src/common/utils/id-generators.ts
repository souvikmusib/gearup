import { customAlphabet } from 'nanoid';
import { REFERENCE_ID_PREFIX, JOB_CARD_PREFIX, INVOICE_PREFIX } from '../../config/constants';

const alphanumeric = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

export const generateReferenceId = () => `${REFERENCE_ID_PREFIX}-${alphanumeric()}`;
export const generateJobCardNumber = () => `${JOB_CARD_PREFIX}-${alphanumeric()}`;
export const generateInvoiceNumber = () => `${INVOICE_PREFIX}-${alphanumeric()}`;
export const generateAppointmentRef = () => `APT-${alphanumeric()}`;
export const generateWorkerCode = () => `WRK-${alphanumeric(6)}`;
