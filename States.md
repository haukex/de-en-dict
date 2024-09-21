# State Machine Documentation

```
        Main                                Worker
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄              ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
               Init  ────────────────► (Init)
                 │                      ↓
       [dom loaded]     ◄─[progress]─  LoadingDict
                 ↓                      │
  ╭──► AwaitingDict  ─[status?]─►       │
  │              │                      │
  ╰─┬─[timeout]──┤                      │
    ↓          ╭─┤ ◄──[loaded/error]──  ├────► Error
   Error ◄─────╯ │                      │
    ↑            ↓                      ↓
╭───│───────► Ready                    Ready ◄─────────╮
│   │            │                      │              │
│   │   [user input] ──[search/rand]──► │              │
│   │            │                      │              │
│   │            ↓                      ↓              │
│   │     Searching     ◄─[progress]─  (Searching)     │
│   │            │                      │              │
│   ╰─[timeout]──┤                      │              │
│                │ ◄──────[done]──────  │              │
╰────────────────╯                      ╰──────────────╯
```

## Main (UI) Thread

1. `Init`
    - On initialization, the Worker is immediately initialized
      - Note the main thread does not yet set up the listener for messages from the worker.
    - On `DOMContentLoaded`, transition to the next state:
2. `AwaitingDict`
    - Upon entering this state:
      - Set up the message listener for messages from the Worker.
      - Send a status request to the Worker
        (which I think *in theory* may even arrive before the worker is started, hence the need for a timeout).
      - A timer is set up to trigger a timeout.
    - On timeout:
      - For the first few timeouts, remain in this state, but send another status request to the Worker
        and set a new timeout.
      - After a few retries without getting a reply from the Worker, enter the `Error` state.
    - On reception of a message from the worker saying that it is loading the dictionary,
      stop the timeout timer, because loading progress reports *may* be infrequent and we
      don't want a timeout (how often progress is reported depends on the browser!).
      Of course I hope most browsers will chunk streams in a sensible way, so the user
      gets enough progress reports on slow connections.
    - On reception of a message from the worker saying that there was an error loading the dictionary,
      stop the timeout timer and go to state `Error`.
    - On reception of a message from the worker saying the dictionary is loaded,
      stop the timeout timer and go to `Ready`.
      - Only at this time is the `hashchange` event listener installed, and an initial `searchFromUrl` triggered -
        which causes an immediate transition to `Searching`.
3. `Ready`
    - Idle state, can only be exited by user input, including a hash change.
    - When a search is initiated, or the user requests a random entry,
      the corresponding request is sent to the Worker, and go to state `Searching`.
4. `Searching`
    - When entering this state, set up a timer for timeout.
    - The timeout timer is reset every time a progress message is received.
    - If the timer fires, go to state `Error`.
    - When the final search results are received, display them and return to state `Ready`.
    - When exiting the state, cancel the timer.
5. `Error`
    - Error state: display an error message, and never leave this state (user must reload the page).

## Worker Thread

1. On initialization, immediately begin loading the dictionary.
  This transition is synchronous, hence there is no need for an `Init` state.
2. `LoadingDict`
    - Periodically send progress reports to the main thread, and most importantly,
      send a message when loading is done or an error is encountered.
    - Assuming the main thread's state machine is working correctly,
      search requests in this state should not happen and are ignored.
    - When there is an error loading the dictionary, transition to `Error`.
    - When the dictionary is loaded successfully, transition to the next state:
3. `Ready`
    - Idle state. On reception of a search request, perform the search;
      or when receiving a request for a random entry, send one back.
4. The search operation is synchronous, so there is no need for a `Searching` state.
    - Periodic status updates may be sent if the search is slow.
    - On completion of the search the results are sent back,
      the search function returns and the code remains in the `Ready` state.
5. `Error`
    - Error state: ignore search requests, and never leave this state.

Status report requests from the main thread are always answered with the current state.

### Background Dictionary Updates

The Worker thread may run a background dictionary update after loading the dictionary.
Since this does not affect the operation of the main thread or the Worker, this can
happen asynchronously and is simply reported with a separate message.
