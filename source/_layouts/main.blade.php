<!DOCTYPE html>
<html lang="{{ $page->language ?? 'en' }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="canonical" href="{{ $page->getUrl() }}">
        <meta name="description" content="{{ $page->description }}">
        <title>{{ $page->title }}</title>
        {{-- <link rel="stylesheet" href="{{ mix('css/main.css', 'assets/build') }}">
        <script defer src="{{ mix('js/main.js', 'assets/build') }}"></script> --}}
        {{ (new Vite)(['source/_assets/css/main.css', 'source/_assets/js/main.js'], 'public/build') }}
    </head>
    <body class="font-sans antialiased text-gray-900 bg-black">
        @yield('body')
    </body>
</html>
