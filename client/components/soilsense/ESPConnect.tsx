// Replace with your ESP32 IP
const ESP32_API = "http://<ESP32_IP>/soil";

// Function to fetch soil data
async function fetchSoilData() {
  try {
    const response = await import("@/lib/safeFetch").then((m) =>
      m.safeFetch(ESP32_API),
    );
    if (!response || !response.ok)
      throw new Error("Network response was not ok");
    const data = response ? await response.json() : null;

    // Return only the soil properties
    return {
      N: data.N,
      P: data.P,
      K: data.K,
      Moisture: data.Moisture,
      pH: data.pH,
      EC: data.EC,
      Temperature: data.Temperature,
      timestamp: data.timestamp,
    };
  } catch (error) {
    console.error("Error fetching soil data:", error);
    return null;
  }
}

// Example: push data to a global data layer (for future integrations)
async function updateSoilData() {
  const soil = await fetchSoilData();
  if (soil) {
    // Map soil data to global object for future integrations
    (window as any).soilData = soil;

    // You can also update specific elements by ID
    document.getElementById("N").innerText = soil.N;
    document.getElementById("P").innerText = soil.P;
    document.getElementById("K").innerText = soil.K;
    document.getElementById("Moisture").innerText = soil.Moisture;
    document.getElementById("pH").innerText = soil.pH;
    document.getElementById("EC").innerText = soil.EC;
    document.getElementById("Temperature").innerText = soil.Temperature;
    document.getElementById("timestamp").innerText = soil.timestamp;
  }
}

// Initial fetch
updateSoilData();

// Auto-refresh every 5 seconds
setInterval(updateSoilData, 5000);
