import { CONFIG } from "./env-config.js";

async function validate(parameter, type) {
  if (!parameter || typeof parameter !== "string") {
    throw new Error("Invalid parameter provided");
  }

  let url;
  if (type === "email") {
    url = `${CONFIG.EMAIL_VALIDATION_API.BASE_URL}?key=${
      CONFIG.EMAIL_VALIDATION_API.KEY
    }&email=${encodeURIComponent(parameter)}&timeout=${
      CONFIG.CACHE_SETTINGS.TIMEOUT
    }&$cache=${
      CONFIG.CACHE_SETTINGS.ENABLED
    }&$block=true&SOURCE=PCA-SCRIPT&SESSION=${
      CONFIG.EMAIL_VALIDATION_API.SESSION
    }`;
  } else if (type === "phone") {
    url = `${CONFIG.PHONE_VALIDATION_API.BASE_URL}?key=${
      CONFIG.PHONE_VALIDATION_API.KEY
    }&phone=${encodeURIComponent(parameter)}&$cache=${
      CONFIG.CACHE_SETTINGS.ENABLED
    }&$block=true&SOURCE=PCA-SCRIPT&SESSION=${
      CONFIG.PHONE_VALIDATION_API.SESSION
    }`;
  } else {
    throw new Error(`Unknown validation type: ${type}`);
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API ERROR: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data || typeof data !== "object") {
      throw new Error("Invalid response format from API");
    }

    return data;
  } catch (error) {
    console.error(
      `Validation error for ${type} "${parameter}":`,
      error.message
    );
    throw new Error(`Failed to validate ${type}: ${error.message}`);
  }
}

export { validate };
