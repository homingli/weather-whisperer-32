/** HKO API response interfaces */

export interface HKOCurrentWeatherResponse {
  rainfall: {
    data: Array<{
      unit: string;
      place: string;
      max: number;
      main: string;
    }>;
    startTime: string;
    endTime: string;
  };
  icon: number[];
  iconUpdateTime: string;
  uvindex?: {
    data: Array<{
      place: string;
      value: number;
      desc: string;
    }>;
    recordDesc: string;
  };
  updateTime: string;
  temperature: {
    data: Array<{
      place: string;
      value: number;
      unit: string;
    }>;
    recordTime: string;
  };
  humidity: {
    data: Array<{
      place: string;
      value: number;
      unit: string;
    }>;
    recordTime: string;
  };
  wind?: {
    data: Array<{
      place: string;
      speed: number;
      direction: number;
    }>;
  };
  warningMessage?: string[];
}

export interface HKOForecastResponse {
  generalSituation: string;
  weatherForecast: Array<{
    forecastDate: string;
    week: string;
    forecastWind: string;
    forecastWeather: string;
    forecastMaxtemp: { value: number; unit: string };
    forecastMintemp: { value: number; unit: string };
    forecastMaxrh: { value: number; unit: string };
    forecastMinrh: { value: number; unit: string };
    ForecastIcon: number;
    PSR: string; // Probability of Significant Rain
  }>;
  updateTime: string;
}

export interface HKOWarning {
  name: string;
  code: string;
  type?: string;
  actionCode: string;
  issueTime: string;
  updateTime: string;
  expireTime?: string;
  details?: HKOWarningDetails;
}

export interface HKOWarningDetails {
  contents?: string[];
  subtype?: string;
  updateTime?: string;
}

export interface HKOWarningSummaryResponse {
  [key: string]: HKOWarning;
}

export interface HKOWarningInfoDetail {
  warningStatementCode: string;
  subtype?: string;
  contents?: string[];
  updateTime?: string;
}

export interface HKOWarningInfoResponse {
  details?: HKOWarningInfoDetail[];
}
