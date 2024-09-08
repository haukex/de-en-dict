# State Machine Documentation

**DRAFT**

```
          Main                             Worker
    ----------------                  ----------------
               Init -----------------> (Init)
                 |                      V
       [dom loaded]      <-[progress]- LoadingDict
                 V                      |
  +--> AwaitingDict -[status?]->        |
  |              |                      |
  +-+-[timeout]--+                      |
    V           /| <--[loaded/error]--- +----> Error
   Error <-----/ |                      |
    ^            V                      V
+---|-------> Ready                    Ready <---------+
|   |            |                      |              |
|   |         [user] ---[search]------> |              |
|   |            |                      |              |
|   |            V                      V              |
|   |     Searching      <-[progress]- (Searching)     |
|   |            |                      |              |
|   +-[timeout]--+                      |              |
|                | <---[done/error]---- |              |
+----------------+                      +--------------+
```

## Main (UI) Thread

1. `Init`
    - On initialization, the Worker is immediately initialized, but its message listener is not yet set up.
2. `AwaitingDict`
    - Is entered upon `DOMContentLoaded`.
      - This is when the Worker's message listener is set up.
      - Entering this state triggers a status request to be sent to the Worker
        (which I think in theory may even arrive before the worker is started, hence the need for a timeout).
      - A timer is set up to trigger a timeout.
    - On timeout, a repeated status message is sent.
      After a few retries without getting a progress report from the Worker, the `Error` state is entered.
    - On reception of a message saying that there was an error loading the dictionary, stop the timeout timer
      and go to `Error.`
    - On reception of a message saying the dictionary is loaded, stop the timeout timer and go to `Ready`.
      - Only at this time is the `hashchange` event listener installed,
        and an initial `searchFromUrl` triggered.
3. `Ready`
    - Idle state, can only be exited by user input, including a hash change
    - When a search is initiated, the corresponding request is sent to the Worker.
4. `Searching`
    - When entering this state, set up a timer for timeout.
    - When exiting the state due to success, cancel the timer.

## Worker Thread

1. On initialization, immediately begin loading the dictionary.
  This is synchronous, hence no need for a corresponding state.
2. `LoadingDict`
    - Periodically sends progress reports to the main thread,
      and most importantly, send a message when loading is done or an error is encountered.
3. `Ready`
    - Idle state. On reception of a search request, perform the search.
4. The search operation is synchronous, so there is no need for a corresponding state.
    - Periodic status updates may be sent if the search is slow.
