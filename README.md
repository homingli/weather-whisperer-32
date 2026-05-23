# Weather Forecast Application

A modern, responsive weather application built with React and TypeScript. Features real-time weather data from multiple sources including the Hong Kong Observatory (HKO) and Open-Meteo, with support for multiple languages and a sleek glass-morphism design.

## Features

- **Dual Weather Sources**: Automatically switches between Hong Kong Observatory (HKO) and Open-Meteo based on location
- **Consolidated Settings**: Manage location search, current location detection, theme, language, and manual data refresh from a single menu
- **Multi-Language Support**: English and Traditional Chinese interface
- **Location Services**: Auto-detect user location or search for any city worldwide with recent cities history
- **Weather Data**: Current conditions, hourly forecasts (6 hours), and daily forecasts (7 days)
- **Local Timezone Display**: Shows date and time in the selected location's timezone
- **High/Low Temperatures**: Daily minimum and maximum temperatures displayed in the hero section
- **Sun Events**: Displays sunset or sunrise times based on current day/night status
- **Hourly Charts**: Interactive line charts showing temperature and precipitation probability with PSR (Probability of Significant Rain) labels
- **Weather Alerts**: Real-time weather warnings and alerts (HKO source only)
- **Responsive Design**: Optimized for mobile, tablet, and desktop devices
- **Smart Caching**: Refetches data every 10 minutes with 2-minute stale time

## Technology Stack

- **Frontend Framework**: React 18 with TypeScript 5
- **Build Tool**: Vite 5
- **UI Components**: shadcn-ui with Radix UI 1.x
- **Styling**: Tailwind CSS 3 with custom animations
- **Data Fetching**: TanStack React Query 5
- **Routing**: React Router 7
- **Icons**: Lucide React
- **Charts**: Recharts 2
- **Date Handling**: date-fns 3
- **Forms**: React Hook Form 7 with Zod 3 validation

## Project Structure

```
src/
├── components/         # Reusable UI components
│   ├── ui/            # shadcn-ui components
│   ├── CurrentWeather.tsx
│   ├── HourlyForecast.tsx
│   ├── DailyForecast.tsx
│   ├── SettingsMenu.tsx
│   ├── WeatherAlerts.tsx
│   └── ...
├── contexts/          # React Context providers
│   ├── LanguageContext.tsx
│   └── ThemeContext.tsx
├── lib/               # Utility functions and API clients
│   ├── weather.ts     # Open-Meteo API & Geocoding integration
│   └── hko-weather.ts # Hong Kong Observatory API integration
├── pages/             # Page components
│   ├── Index.tsx      # Main weather page
│   └── NotFound.tsx   # 404 page
├── App.tsx            # Root app component
└── main.tsx           # Application entry point
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/homingli/weather-whisperer-32.git

# Navigate to project directory
cd weather-whisperer-32

# Install dependencies
npm install
```

### Development

```bash
# Start the development server
npm run dev
```

The application will open at `http://localhost:5173` with hot module replacement enabled.

### Build

```bash
# Build for production
npm run build

# Preview production build locally
npm run preview
```

## API Sources

### Open-Meteo
- Free, open-source weather API
- Global coverage
- Provides current weather, hourly, and daily forecasts

### Hong Kong Observatory (HKO)
- Official Hong Kong weather data (automatically used for HK locations)
- Includes weather warnings and alerts
- Probability of Significant Rain (PSR) data
- Station-based observations

## Features Breakdown

### Current Weather
The hero section displays:
- **Location & Time**: Current city name and local time formatted for that timezone
- **Weather Icon**: Large weather icon indicating current conditions
- **Temperature**: Current apparent temperature with "feels like" label
- **Daily Range**: High and low temperatures for the day with visual indicators
- **Weather Condition**: Current precipitation and humidity data
- **Umbrella Indicator**: Shows whether an umbrella is recommended based on current rain or upcoming precipitation
- **Sun Events**: Displays the next sunset (during day) or sunrise (during night) with exact time

### Hourly Forecast
6-hour forecast with interactive line chart showing:
- Temperature trend (left Y-axis)
- Precipitation probability with PSR labels (right Y-axis)
- Hourly time slots

### Daily Forecast
7-day forecast with:
- Min/max temperatures
- Weather conditions
- Precipitation probability
- Weather icons

### Settings & Navigation
The consolidated hamburger menu provides access to:
- **Global City Search**: Autocomplete search for any location
- **Recent Locations**: Quick access to previously visited cities
- **Current Location**: One-tap detection of user's current position
- **Theme Toggle**: Switch between Light, Dark, and Auto modes
- **Language Toggle**: Switch between English and Traditional Chinese
- **Manual Data Refresh**: Force clear local caches and fetch fresh weather data on-demand

### Weather Alerts
Real-time weather warnings featuring a streamlined, compact UI including:
- Typhoon signals
- Rainstorm warnings
- Special weather advisories
- Other meteorological hazards (HKO only)
- Space-efficient layout with cleanly aligned issue times

## Local Storage

The application stores:
- Default city selection (persists across sessions)
- Recent search history

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Performance

- Automatic data refetch every 10 minutes
- Efficient caching with React Query
- Optimized animations with Tailwind CSS
- Responsive images and lazy loading
- Production-optimized build with Vite

## License

This project is built with Lovable and uses open-source libraries. Please refer to individual package licenses.

## Support

For issues and feature requests, please contact through the Lovable platform or your project repository.
