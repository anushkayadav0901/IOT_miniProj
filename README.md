## 📌 **Project Overview**

This project is a **Smart Parking Management System** designed using **Arduino UNO R4 WiFi**, **IR obstacle sensors**, **Ultrasonic sensor**, **Gas sensor (MQ-2)**, **Servo motor**, and **ThingSpeak Cloud**.

The aim of the project is to **monitor parking slot occupancy in real-time**, **automatically control the entry gate**, and **track environmental safety** through gas levels.
All sensor readings are updated live on a **modern web dashboard** featuring a **clean black and yellow theme**, making the system suitable for **smart campus**, **mall**, or **society parking automation**.

---
live demo - https://igdtuw-iot-project.netlify.app/
<img width="1526" height="866" alt="image" src="https://github.com/user-attachments/assets/67c013b4-1cf3-4225-98cb-11b83900ac6a" />

<img width="859" height="702" alt="image" src="https://github.com/user-attachments/assets/cc52f273-f9c6-451b-b42d-415bb2ecddb4" />


## 🎨 **UI Design Features**

### **Modern Theme**
- **Black and deep charcoal backgrounds** (#000000, #0D0D0D)
- **Yellow accent color** (#FFD000) for highlights, borders, and icons
- **Minimalistic, well-spaced layout**
- **Clean typography** with bold headings and medium subtext
- **Smooth rounded cards** with subtle shadows
- **Premium, futuristic, and easy-to-read design**

### **Three-Page Structure**
1. **Landing Page** - Hero section with "Never Circle Again" tagline
2. **Dashboard** - Real-time data visualization with live indicators
3. **Parking Visualization** - Interactive parking slot layout

---

## 🎯 **Project Objectives**

✔ Detect and display **available / occupied parking slots**
✔ Automatically **open/close entry gate** using IR sensor
✔ Measure **distance** using an Ultrasonic sensor
✔ Monitor **gas leak detection** for safety
✔ Upload all readings to **ThingSpeak IoT Cloud**
✔ Display real-time dashboard on a **modern website**
✔ Create a **scalable parking automation system**
✔ Provide **premium user experience** with clean UI design

---

## 🧩 **Hardware Components Used**

| Component                   | Quantity | Purpose                           |
| --------------------------- | -------- | --------------------------------- |
| Arduino UNO R4 WiFi         | 1        | Main microcontroller + WiFi       |
| IR Sensors                  | 4        | Entry detection + 3 parking slots |
| Ultrasonic Sensor (HC-SR04) | 1        | Distance measurement              |
| Gas Sensor (MQ-2)           | 1        | Gas leakage alert                 |
| Servo Motor (SG90)          | 1        | Gate control                      |
| Breadboard                  | 1        | Power distribution                |
| Jumper Wires                | Many     | Connections                       |
| 5V Power Supply / USB       | 1        | Power                             |

---

## 🔌 **Circuit Wiring Summary**

| Device          | VCC | GND | Signal Pin |
| --------------- | --- | --- | ---------- |
| Entry IR        | 5V  | GND | D5         |
| Slot IR 1       | 5V  | GND | D6         |
| Slot IR 2       | 5V  | GND | D7         |
| Slot IR 3       | 5V  | GND | D8         |
| Servo Motor     | 5V  | GND | D9         |
| Ultrasonic TRIG | 5V  | GND | D10        |
| Ultrasonic ECHO | 5V  | GND | D11        |
| Gas Sensor      | 5V  | GND | A0         |

---

## 🧠 **Working Principle**

### **1️⃣ Entry Gate Automation**

* As a vehicle approaches, the **Entry IR Sensor becomes LOW**
* Arduino opens the gate by rotating the **servo motor to 90°**
* When the vehicle passes, IR becomes HIGH → gate closes automatically

---

### **2️⃣ Slot Detection**

Each parking slot has an **IR sensor**:

* IR LOW → Object detected → *Slot Occupied*
* IR HIGH → Empty Slot

These readings are sent to ThingSpeak fields in real-time.

---

### **3️⃣ Gas Monitoring**

* MQ-2 reads smoke/gas concentration
* Higher values raise alerts on the dashboard

---

### **4️⃣ Distance Measurement**

* Ultrasonic sensor continuously sends distance readings
* Helps identify obstacles or monitor vehicle movement

---

### **5️⃣ Cloud IoT Integration (ThingSpeak)**

| Field No.   | Parameter           |
| ----------- | ------------------- |
| **Field 1** | Slot 1              |
| **Field 2** | Slot 2              |
| **Field 3** | Slot 3              |
| **Field 4** | Gas Sensor          |
| **Field 5** | Ultrasonic Distance |

Data updates every **20 seconds** as required by ThingSpeak.

---

## 🌐 **Web Dashboard**

A modern, responsive dashboard (HTML + CSS + JS) featuring a **premium black and yellow theme** that fetches data directly from ThingSpeak using JavaScript API calls.

### Dashboard Features:

**📊 Dashboard Page**
- **Live indicator** with green pulse animation
- **Four info cards** in horizontal grid:
  - Total Slots
  - Available Slots  
  - Occupied Slots
  - Occupancy Rate (%)
- **Large Air Quality card** showing PPM levels
- **Large Ultrasonic Distance card** showing cm readings
- **Occupancy trend line chart** with smooth animations
- **AI Prediction Engine** for next 10-minute occupancy

**🚗 Parking Visualization Page**
- **Clean parking layout** showing 3 slots
- **Green indicators** for available slots
- **Red indicators** for occupied slots
- **Gate status card** (Open/Closed) with visual indicators
- **Real-time statistics** summary

**🏠 Landing Page**
- **Hero section** with "Never Circle Again" headline
- **Smart, Real-Time Parking Automation** subtitle
- **Live statistics cards** with hover effects
- **Find Parking CTA button** (yellow, rounded)
- **3D parking lot animation** with slot indicators

### Design Principles:
- **Black/charcoal backgrounds** with yellow accents
- **Wide spacing** and clean grid alignment
- **Consistent components** across all pages
- **Visually appealing** yet minimal approach
- **Focus on clarity** and readability
- **Premium, futuristic** feel suitable for IoT dashboards

### Technical Features:
- **Live data refresh** every 20 seconds
- **Smooth animations** and transitions
- **Responsive design** for all screen sizes
- **Chart.js integration** for data visualization
- **TensorFlow.js** for AI predictions

---

## 📡 **Software / Libraries Used**

### **Arduino Libraries**

* WiFiS3
* ThingSpeak
* Servo

### **Web Technologies**

* HTML
* CSS
* JavaScript
* ThingSpeak REST API

---

## 📈 **Outputs / Results**

✔ Automatic entry gate opens accurately
✔ Slot detection works with high reliability
✔ Dashboard shows all live data (refresh every 5 sec)
✔ Thingspeak graphs are generated for all parameters
✔ Complete end-to-end IoT parking system achieved

---

## 🎯 **Future Enhancements**

* Mobile App integration
* Automated Billing based on parking time
* ANPR (Number Plate Recognition)
* Firebase or MQTT integration
* Multi-floor parking management

---

## 🏁 **Conclusion**

This project successfully demonstrates a **real-time IoT-based parking automation system**.
Using Arduino R4 WiFi and ThingSpeak cloud, we implemented a cost-effective, scalable, and smart parking solution suitable for real-world applications.

---
