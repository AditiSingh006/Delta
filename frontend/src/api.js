import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const api = axios.create({ baseURL: `${API_URL}/api` });

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem("sw_token", token);
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem("sw_token");
  }
}

export function getStoredToken() {
  return localStorage.getItem("sw_token");
}

export { API_URL };
