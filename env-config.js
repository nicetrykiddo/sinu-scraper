// Environment configuration for Chrome Extension
// Since Chrome extensions can't directly read .env files, we need to manually
// copy the values from .env file to this configuration

// TODO: Replace these values with your actual API keys from .env file
const CONFIG = {
  EMAIL_VALIDATION_API: {
    KEY: "KJ99-ZE59-WN19-XC15", // Copy from EMAIL_VALIDATION_API_KEY in .env
    BASE_URL:
      "https://services.postcodeanywhere.co.uk/EmailValidation/Interactive/Validate/v2.00/json3ex.ws",
    SESSION: "0bd583e1-aced-7f33-dc90-e24cce1a5af9", // Copy from EMAIL_VALIDATION_API_SESSION in .env
  },
  PHONE_VALIDATION_API: {
    KEY: "AN88-MN92-JG47-YK63", // Copy from PHONE_VALIDATION_API_KEY in .env
    BASE_URL:
      "https://services.postcodeanywhere.co.uk/PhoneNumberValidation/Interactive/Validate/v2.20/json3ex.ws",
    SESSION: "11a7759d-b1d5-9c69-ad0c-404ef1b5f912", // Copy from PHONE_VALIDATION_API_SESSION in .env
  },
  CACHE_SETTINGS: {
    ENABLED: true, // Copy from CACHE_ENABLED in .env
    TIMEOUT: 5000, // Copy from CACHE_TIMEOUT in .env
  },
};

export { CONFIG };
