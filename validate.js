async function validate(parameter, type) {
  let url;
  if (type === "email") {
    url = `https://services.postcodeanywhere.co.uk/EmailValidation/Interactive/Validate/v2.00/json3ex.ws?key=KJ99-ZE59-WN19-XC15&email=${parameter}&timeout=5000&$cache=true&$block=true&SOURCE=PCA-SCRIPT&SESSION=0bd583e1-aced-7f33-dc90-e24cce1a5af9`;
  } else if (type === "phone") {
    url = `https://services.postcodeanywhere.co.uk/PhoneNumberValidation/Interactive/Validate/v2.20/json3ex.ws?key=AN88-MN92-JG47-YK63&phone=${parameter}&$cache=true&$block=true&SOURCE=PCA-SCRIPT&SESSION=11a7759d-b1d5-9c69-ad0c-404ef1b5f912`;
  } else {
    throw new Error(`Unknown type: ${type}`);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API ERROR: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export { validate };
