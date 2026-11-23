import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true
});

export function getErrorMessage(error) {
  return error.response?.data?.message || 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง';
}

export default api;
