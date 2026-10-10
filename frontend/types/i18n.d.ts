import '@nuxtjs/i18n'

declare module 'vue-i18n' {
  export interface DefineLocaleMessage {
    common: {
      brand: string
      brandSince: string
      skipToContent: string
      retry: string
      unexpectedError: string
      or: string
    }
    home: {
      eyebrow: string
      title: string
      subtitle: string
      featured: string
      featuredHint: string
      browseAll: string
      destinations: string
      destinationsHint: string
    }
    nav: {
      stays: string
      destinations: string
      trips: string
      dashboard: string
      menu: string
      listYourProperty: string
      signIn: string
      signOut: string
    }
    auth: {
      loginTitle: string
      loginSubtitle: string
      email: string
      password: string
      passwordHint: string
      fullName: string
      rememberMe: string
      forgotPassword: string
      signIn: string
      signingIn: string
      invalidCredentials: string
      newHere: string
      createAccount: string
      registerTitle: string
      registerSubtitle: string
      name: string
      hostIntent: string
      hostIntentHint: string
      creatingAccount: string
      createAccountButton: string
      emailExists: string
      haveAccount: string
      registerDescription: string
    }
    hotels: {
      heading: string
      headingIn: string
      metaDescription: string
      sortBy: string
      sortRecommended: string
      sortPriceAsc: string
      sortPriceDesc: string
      sortRating: string
      sortName: string
      openFilters: string
      openFiltersActive: string
      loadingResults: string
      loadError: string
      loadErrorHint: string
      emptyTitle: string
      emptyHint: string
      clearAll: string
      resultCount: string
      resultCountOne: string
      summaryDates: string
      summaryGuests: string
    }
    search: {
      destination: string
      destinationPlaceholder: string
      guestsOne: string
      guests: string
      guestsMany: string
      checkIn: string
      checkOut: string
      invalidRange: string
      submit: string
      freeCancellationNote: string
    }
  }
}
