# Weather Forecast Application

A modern, responsive weather application built with React and TypeScript. Features real-time weather data from multiple sources including the Hong Kong Observatory (HKO) and Open-Meteo, with support for multiple languages and a sleek glass-morphism design.

## Features

- **Dual Weather Sources**: Switch between Open-Meteo and Hong Kong Observatory (HKO) APIs
- **Multi-Language Support**: English and Traditional Chinese interface
- **Location Services**: Auto-detect user location or search for any city worldwide
- **Weather Data**: Current conditions, hourly forecasts (6 hours), and daily forecasts (7 days)
- **Hourly Charts**: Interactive line charts showing temperature and precipitation probability with PSR (Probability of Significant Rain) labels
- **Weather Alerts**: Real-time weather warnings and alerts (HKO source only)
- **Responsive Design**: Optimized for mobile, tablet, and desktop devices
- **Data Persistence**: Saves default city selection in local storage
- **Smart Caching**: Refetches data every 5 minutes with 2-minute stale time

## Technology Stack

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Components**: shadcn-ui with Radix UI
- **Styling**: Tailwind CSS with custom animations
- **Data Fetching**: TanStack React Query
- **Routing**: React Router
- **Icons**: Lucide React
- **Charts**: Recharts
- **Date Handling**: date-fns
- **Forms**: React Hook Form with Zod validation

## Project Structure

```
src/
├── components/         # Reusable UI components
│   ├── ui/            # shadcn-ui components
│   ├── CurrentWeather.tsx
│   ├── HourlyForecast.tsx
│   ├── DailyForecast.tsx
│   ├── CitySearch.tsx
│   ├── WeatherAlerts.tsx
│   └── ...
├── contexts/          # React Context providers
│   ├── LanguageContext.tsx
│   └── WeatherSourceContext.tsx
├── lib/               # Utility functions and API clients
│   ├── weather.ts     # Open-Meteo API integration
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
git clone <YOUR_GIT_URL>

# Navigate to project directory
cd <YOUR_PROJECT_NAME>

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
- Official Hong Kong weather data
- Includes weather warnings and alerts
- Probability of Significant Rain (PSR) data
- Station-based observations

## Features Breakdown

### Current Weather
Displays current temperature, weather condition, humidity, wind speed, and real feel temperature.

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

### City Search
Global city search with autocomplete functionality. Saves selected city as default for future visits.

### Weather Alerts
Real-time weather warnings including:
- Typhoon signals
- Rainstorm warnings
- Special weather advisories
- Other meteorological hazards (HKO only)

### Language Toggle
Switch between English and Traditional Chinese for the entire interface.

### Weather Source Toggle
Switch between Open-Meteo (global) and HKO (Hong Kong) data sources.

## Local Storage

The application stores:
- Default city selection (persists across sessions)

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Performance

- Automatic data refetch every 5 minutes
- Efficient caching with React Query
- Optimized animations with Tailwind CSS
- Responsive images and lazy loading
- Production-optimized build with Vite

## Customization

### Adding a New Weather Source

1. Create a new API integration file in `src/lib/`
2. Export functions matching the existing API patterns
3. Add a toggle option in the WeatherSourceContext
4. Update the Index page to handle the new source

### Styling

All styles use Tailwind CSS with custom weather-themed variables defined in `src/index.css`. Modify the CSS custom properties to customize colors and animations.

## Troubleshooting

**Location not detected**: Ensure your browser has permission to access location services and you're on a secure (HTTPS) connection.

**Weather data not loading**: Check your internet connection and ensure the selected API source is available.

**UI looks broken**: Clear browser cache and ensure you're using a modern browser with JavaScript enabled.

## License

This project is built with Lovable and uses open-source libraries. Please refer to individual package licenses.

## Support

For issues and feature requests, please contact through the Lovable platform or your project repository.
